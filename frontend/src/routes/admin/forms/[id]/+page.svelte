<script lang="ts">
  import { getContext, onDestroy, untrack } from "svelte";
  import { page } from "$app/stores";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import { EditHistory } from "$lib/editHistory.svelte.ts";
  import { realtime, type PresenceUser } from "$lib/stores/realtime.svelte.ts";
  import { mergeValue, patchInPlace, planFieldMerge, sameValue, stableStringify } from "$lib/formMerge.ts";
  import type { FieldDefinition, MetaColumn, FormDetail, Permission } from "$lib/types.ts";

  const editorState = getContext<{
    form: FormDetail | null;
    permission: Permission;
    saving: boolean;
    saved: boolean;
    error: string | null;
    saveCallback: (() => Promise<void>) | null;
    history: EditHistory<unknown> | null;
    markDirty: () => void;
    remoteCallback: ((form: Partial<FormDetail>) => void) | null;
    selections: Record<string, { user: PresenceUser; fieldKey: string }>;
    presenceEpoch: number;
  }>("form-editor-context");

  const id = $page.params.id as string;

  let fields = $state<FieldDefinition[]>([]);
  let metaColumns = $state<MetaColumn[]>([]);
  let settings = $state(settingsOf(null));

  /** Réglages éditables ici, dans la forme attendue par le builder. */
  function settingsOf(form: FormDetail | null) {
    return {
      title: form?.title ?? "",
      description: form?.description ?? "",
      requireConsent: form?.requireConsent ?? true,
      consentText: form?.consentText ?? "",
      isAnonymized: form?.isAnonymized ?? false,
      encryptResponses: form?.encryptResponses ?? false,
      visibility: form?.visibility ?? "PUBLIC",
      allowedEmails: form?.allowedEmails ?? ([] as string[]),
      translations: (form?.translations ?? {}) as any,
    };
  }

  /** Copie détachée : l'éditeur ne doit partager aucun objet avec l'état enregistré. */
  function detach<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  type EditorSnapshot = { fields: FieldDefinition[]; metaColumns: MetaColumn[]; settings: ReturnType<typeof settingsOf> };

  function snapshotOf(form: FormDetail): EditorSnapshot {
    return detach({
      fields: form.schema ?? [],
      metaColumns: form.metaColumns ?? [],
      settings: settingsOf(form),
    });
  }

  /**
   * Dernier état connu du serveur. L'éditeur s'en écarte à chaque frappe :
   * c'est cet écart qui déclenche l'enregistrement.
   *
   * Il était auparavant lu dans `editorState.form`, dont le schéma était le
   * même objet que `fields` : l'état « enregistré » suivait chaque frappe, la
   * différence restait nulle et les modifications de questions ne partaient
   * jamais d'elles-mêmes.
   */
  let base = $state.raw<EditorSnapshot | null>(null);
  // Clés triées : une question mise à jour par un collaborateur peut voir ses
  // propriétés réordonnées sans que rien n'ait changé.
  const baseSignature = $derived(base ? stableStringify(base) : "");

  const history = new EditHistory({
    snapshot: () => $state.snapshot({ fields, metaColumns, settings }),
    apply: (value) => {
      fields = value.fields as FieldDefinition[];
      metaColumns = value.metaColumns as MetaColumn[];
      settings = value.settings as typeof settings;
    },
  });

  // Chargement (ou rechargement après restauration d'une version) : seule
  // l'identité de `editorState.form` compte, pas son contenu, que
  // l'enregistrement met à jour au fil de l'eau.
  $effect(() => {
    const form = editorState.form;
    if (!form) return;
    untrack(() => {
      const snapshot = snapshotOf(form);
      base = snapshot;
      fields = detach(snapshot.fields);
      metaColumns = detach(snapshot.metaColumns);
      settings = detach(snapshot.settings);
      history.reset();
    });
  });

  async function save() {
    if (!editorState.form) return;
    const sent = detach($state.snapshot({ fields, metaColumns, settings })) as EditorSnapshot;

    await api.updateForm(id, {
      // Un titre vidé en cours de saisie ne doit pas bloquer l'enregistrement
      // des questions : le serveur exige un titre.
      title: sent.settings.title.trim() || "Sans titre",
      // Un champ vidé part tel quel : `undefined` serait ignoré par le serveur
      // et l'ancienne valeur resterait en base.
      description: sent.settings.description,
      schema: sent.fields,
      metaColumns: sent.metaColumns,
      requireConsent: sent.settings.requireConsent,
      consentText: sent.settings.consentText,
      isAnonymized: sent.settings.isAnonymized,
      encryptResponses: sent.settings.encryptResponses,
      visibility: sent.settings.visibility,
      allowedEmails: sent.settings.allowedEmails,
      translations: sent.settings.translations,
    });

    base = sent;
    // L'en-tête et les autres onglets lisent `editorState.form` : on le met à
    // jour avec des copies, jamais avec les objets de l'éditeur.
    Object.assign(editorState.form, {
      ...detach(sent.settings),
      schema: detach(sent.fields),
      metaColumns: detach(sent.metaColumns),
    });
  }

  /**
   * État enregistré par un collaborateur : ce que la personne n'a pas touché
   * depuis le dernier état connu suit le serveur, ce qu'elle modifie reste
   * le sien (voir formMerge.ts). Les questions sont mises à jour sur place :
   * la carte ouverte, le focus et la saisie en cours sont préservés.
   */
  function applyRemote(form: Partial<FormDetail>) {
    if (!base || !editorState.form) return;
    const remote = snapshotOf({ ...editorState.form, ...form } as FormDetail);
    // Écho de son propre enregistrement, ou rien de neuf.
    if (sameValue(remote, base)) return;

    const local = $state.snapshot({ fields, metaColumns, settings }) as EditorSnapshot;

    const plan = planFieldMerge(base.fields, local.fields, remote.fields);
    const localByKey = new Map(fields.map((field) => [field.key, field]));
    const remoteByKey = new Map(remote.fields.map((field) => [field.key, field]));
    fields = plan.order.map((key) => {
      const current = localByKey.get(key);
      if (!plan.takeRemote.has(key)) return current!;
      const incoming = remoteByKey.get(key)!;
      if (!current) return incoming;
      patchInPlace(current as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>);
      return current;
    });

    const mergedMeta = mergeValue(base.metaColumns, local.metaColumns, remote.metaColumns);
    if (!sameValue(mergedMeta, local.metaColumns)) metaColumns = detach(mergedMeta);
    for (const key of Object.keys(remote.settings) as (keyof EditorSnapshot["settings"])[]) {
      const merged = mergeValue(base.settings[key], local.settings[key], remote.settings[key]);
      if (!sameValue(merged, local.settings[key])) (settings as Record<string, unknown>)[key] = detach(merged);
    }

    base = remote;
    // En-tête (titre, publication) et autres onglets.
    Object.assign(editorState.form, form);
  }

  $effect(() => {
    editorState.remoteCallback = applyRemote;
    return () => {
      editorState.remoteCallback = null;
    };
  });

  // --- Sélections : la sienne est montrée aux autres, les leurs ici ---

  let selectedKey = $state<string | null>(null);

  $effect(() => {
    void editorState.presenceEpoch;
    realtime.sendSelection(id, selectedKey);
  });

  onDestroy(() => realtime.sendSelection(id, null));

  /** Collaborateurs ayant sélectionné chaque question, par clé de question. */
  const remoteSelections = $derived.by(() => {
    const byField: Record<string, PresenceUser[]> = {};
    for (const { user, fieldKey } of Object.values(editorState.selections)) {
      (byField[fieldKey] ??= []).push(user);
    }
    return byField;
  });

  // Register save function with the parent layout
  $effect(() => {
    editorState.saveCallback = save;
    return () => {
      editorState.saveCallback = null;
    };
  });

  $effect(() => {
    editorState.history = history as EditHistory<unknown>;
    return () => {
      editorState.history = null;
      history.dispose();
    };
  });

  // Sérialiser lit l'état en profondeur : l'effet se redéclenche donc pour
  // n'importe quelle modification, y compris à l'intérieur d'un champ.
  $effect(() => {
    const current = stableStringify({ fields, metaColumns, settings });
    if (!base || current === baseSignature) return;
    untrack(() => {
      history.record();
      editorState.markDirty();
    });
  });
</script>

{#if editorState.form}
  <FormBuilder
    bind:fields
    bind:metaColumns
    bind:settings
    {remoteSelections}
    onselectionchange={(key) => (selectedKey = key)}
  />
{/if}
