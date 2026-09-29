<script lang="ts">
  import { getContext, onDestroy, onMount, untrack } from "svelte";
  import { page } from "$app/stores";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import { EditHistory } from "$lib/editHistory.svelte.ts";
  import { realtime, type PresenceUser, type RealtimeEvent } from "$lib/stores/realtime.svelte.ts";
  import {
    applyMeta,
    applyOpsToContent,
    applyOpsToFields,
    detach,
    diffToOps,
    patchInPlace,
    rebaseContent,
    stableStringify,
    touchedKeys,
    withoutKeys,
    type EditorContent,
    type FormOp,
  } from "$lib/formOps.ts";
  import type { FieldDefinition, MetaColumn, FormDetail, Permission } from "$lib/types.ts";

  /**
   * Éditeur des questions, en édition collaborative.
   *
   * Chaque modification part aussitôt au serveur sous forme d'opérations
   * (voir formOps.ts) : question créée, modifiée, supprimée, déplacée, titre
   * changé. Le serveur les applique dans l'ordre, les numérote (révision) et
   * les diffuse aux autres éditeurs, qui les appliquent sur place : chacun
   * voit les autres écrire, et personne ne renvoie jamais le formulaire
   * entier, donc personne n'écrase les questions d'un autre.
   */

  const editorState = getContext<{
    form: FormDetail | null;
    permission: Permission;
    saving: boolean;
    saved: boolean;
    error: string | null;
    history: EditHistory<unknown> | null;
    editorCallback: ((event: RealtimeEvent) => void) | null;
    editRev: number;
    selections: Record<string, { user: PresenceUser; fieldKey: string }>;
    presenceEpoch: number;
  }>("form-editor-context");

  const id = $page.params.id as string;

  let fields = $state<FieldDefinition[]>([]);
  /** Colonnes du tableur : affichées ici, modifiées depuis l'onglet Réponses. */
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

  function contentOf(form: FormDetail): EditorContent {
    return detach({ fields: form.schema ?? [], settings: settingsOf(form) });
  }

  // --- État partagé avec le serveur ---

  /**
   * Ce que le serveur aura une fois nos lots en attente appliqués. Chaque
   * modification locale part sous forme d'écart avec lui.
   */
  let shared: EditorContent | null = null;
  /** Dernière révision appliquée : un trou dans la suite impose une resynchronisation. */
  let lastRev = 0;

  interface Batch {
    id: string;
    ops: FormOp[];
    sentAt: number;
  }
  /** Lots envoyés dont le serveur n'a pas encore accusé réception. */
  let pending = $state<Batch[]>([]);

  const history = new EditHistory({
    snapshot: () => $state.snapshot({ fields, settings }),
    apply: (value) => {
      fields = value.fields as FieldDefinition[];
      settings = value.settings as typeof settings;
    },
  });

  /** Aligne l'éditeur sur un contenu, en gardant les cartes existantes. */
  function showContent(target: EditorContent) {
    const current = new Map(fields.map((field) => [field.key, field]));
    fields = target.fields.map((incoming) => {
      const existing = current.get(incoming.key);
      if (!existing) return detach(incoming);
      patchInPlace(existing as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>);
      return existing;
    });
    for (const [key, value] of Object.entries(target.settings)) {
      (settings as Record<string, unknown>)[key] = detach(value);
    }
  }

  // Chargement (ou rechargement après restauration d'une version).
  $effect(() => {
    const form = editorState.form;
    if (!form) return;
    untrack(() => {
      const content = contentOf(form);
      fields = detach(content.fields);
      settings = detach(content.settings) as typeof settings;
      metaColumns = detach(form.metaColumns ?? []);
      shared = content;
      lastRev = editorState.editRev;
      pending = [];
      history.reset();
    });
  });

  // --- Envoi : chaque modification locale part aussitôt ---

  function send(batch: Batch) {
    batch.sentAt = Date.now();
    realtime.sendOps(id, batch.id, batch.ops);
  }

  // Sérialiser lit l'état en profondeur : l'effet se redéclenche pour
  // n'importe quelle modification, y compris à l'intérieur d'une question.
  $effect(() => {
    void stableStringify({ fields, settings });
    untrack(() => {
      if (!shared || editorState.permission !== "EDITOR") return;
      const current = detach($state.snapshot({ fields, settings })) as EditorContent;
      const ops = diffToOps(shared, current);
      if (ops.length === 0) return;
      shared = applyOpsToContent(shared, ops);
      const batch: Batch = { id: crypto.randomUUID(), ops, sentAt: 0 };
      pending = [...pending, batch];
      send(batch);
      history.record();
    });
  });

  // --- Réception ---

  /** Opérations reçues pendant une resynchronisation, rejouées ensuite. */
  let resyncing = false;
  let resyncAgain = false;
  let buffered: { rev: number; apply: () => void }[] = [];

  /** Applique un évènement numéroté dans l'ordre des révisions. */
  function sequenced(rev: number, apply: () => void) {
    if (resyncing) {
      buffered.push({ rev, apply });
      return;
    }
    if (rev <= lastRev) return;
    if (rev !== lastRev + 1) {
      void resync();
      return;
    }
    lastRev = rev;
    apply();
  }

  function applyRemoteOps(received: FormOp[]) {
    if (!shared) return;
    // Ce que l'on a soi-même modifié sans accusé de réception : notre lot
    // passera après celui-ci sur le serveur, c'est notre version qui reste.
    const mine = touchedKeys(pending.flatMap((batch) => batch.ops));
    const ops = withoutKeys(received, mine);
    if (ops.length === 0) return;
    fields = applyOpsToFields(fields, ops, (current, incoming) => {
      patchInPlace(current as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>);
      return current;
    });
    applyMeta(settings as Record<string, unknown>, ops);
    for (const op of ops) if (op.t === "metaColumns") metaColumns = detach(op.metaColumns);
    shared = applyOpsToContent(shared, ops);
    history.rebase((value) => rebaseContent(value as EditorContent, ops) as typeof value);
  }

  /**
   * Recharge l'état du serveur et y rejoue nos lots en attente : après une
   * coupure, une révision manquée, un lot refusé ou une restauration.
   */
  async function resync() {
    if (resyncing) {
      resyncAgain = true;
      return;
    }
    resyncing = true;
    buffered = [];
    try {
      const res = await api.getForm(id);
      let target = contentOf(res.form);
      for (const batch of pending) target = applyOpsToContent(target, batch.ops);
      showContent(target);
      metaColumns = detach(res.form.metaColumns ?? []);
      shared = target;
      lastRev = res.editRev ?? 0;
      if (editorState.form) {
        const { schema, ...rest } = detach(res.form);
        Object.assign(editorState.form, rest, { schema });
      }
    } catch (e) {
      editorState.error = e instanceof Error ? e.message : "Synchronisation impossible.";
    } finally {
      resyncing = false;
      const replay = buffered;
      buffered = [];
      for (const event of replay) sequenced(event.rev, event.apply);
      if (resyncAgain) {
        resyncAgain = false;
        void resync();
      }
    }
  }

  function onEditorEvent(event: RealtimeEvent) {
    if (event.type === "form:ops") {
      sequenced(event.rev, () => applyRemoteOps(event.ops));
    } else if (event.type === "form:ack") {
      const batch = pending.find((candidate) => candidate.id === event.id);
      if (!batch) return;
      pending = pending.filter((candidate) => candidate !== batch);
      // Refusé en tout ou partie : on reprend l'état du serveur.
      if (event.rev === null || event.rejected > 0) {
        void resync();
        return;
      }
      sequenced(event.rev, () => {});
    } else if (event.type === "form:updated") {
      if (event.resync) void resync();
      else if (editorState.form) editorState.form.isPublished = event.form.isPublished ?? editorState.form.isPublished;
    }
  }

  $effect(() => {
    editorState.editorCallback = onEditorEvent;
    return () => {
      editorState.editorCallback = null;
    };
  });

  // Reconnexion (nouvel abonnement confirmé) : les lots envoyés pendant la
  // coupure n'ont pas pu partir, et des opérations ont pu être manquées.
  let firstEpoch: number | null = null;
  $effect(() => {
    const epoch = editorState.presenceEpoch;
    untrack(() => {
      if (firstEpoch === null) {
        firstEpoch = epoch;
        return;
      }
      if (epoch === firstEpoch) return;
      for (const batch of pending) send(batch);
      void resync();
    });
  });

  // Filet de sécurité : un lot sans réponse (message perdu) est renvoyé ; les
  // opérations sont idempotentes, un double envoi ne double rien.
  onMount(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const batch of pending) if (now - batch.sentAt > 5_000) send(batch);
    }, 2_000);
    return () => clearInterval(timer);
  });

  // --- Indicateur d'enregistrement de l'en-tête ---
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const busy = pending.length > 0;
    untrack(() => {
      if (busy) {
        editorState.saving = true;
        editorState.saved = false;
      } else if (editorState.saving) {
        editorState.saving = false;
        editorState.saved = true;
        if (savedTimer) clearTimeout(savedTimer);
        savedTimer = setTimeout(() => (editorState.saved = false), 2500);
      }
    });
  });

  // --- Sélections : la sienne est montrée aux autres, les leurs ici ---

  let selectedKey = $state<string | null>(null);

  $effect(() => {
    void editorState.presenceEpoch;
    realtime.sendSelection(id, selectedKey);
  });

  onDestroy(() => {
    realtime.sendSelection(id, null);
    editorState.saving = false;
  });

  /** Collaborateurs ayant sélectionné chaque question, par clé de question. */
  const remoteSelections = $derived.by(() => {
    const byField: Record<string, PresenceUser[]> = {};
    for (const { user, fieldKey } of Object.values(editorState.selections)) {
      (byField[fieldKey] ??= []).push(user);
    }
    return byField;
  });

  $effect(() => {
    editorState.history = history as EditHistory<unknown>;
    return () => {
      editorState.history = null;
      history.dispose();
    };
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
