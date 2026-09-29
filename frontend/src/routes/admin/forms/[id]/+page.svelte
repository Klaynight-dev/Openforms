<script lang="ts">
  import { getContext, untrack } from "svelte";
  import { page } from "$app/stores";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import { EditHistory } from "$lib/editHistory.svelte.ts";
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
  const baseSignature = $derived(base ? JSON.stringify(base) : "");

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
    const current = JSON.stringify({ fields, metaColumns, settings });
    if (!base || current === baseSignature) return;
    untrack(() => {
      history.record();
      editorState.markDirty();
    });
  });
</script>

{#if editorState.form}
  <FormBuilder bind:fields bind:metaColumns bind:settings />
{/if}
