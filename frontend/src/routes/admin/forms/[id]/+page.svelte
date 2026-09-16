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

  // Sync settings when form changes or is loaded
  $effect(() => {
    if (editorState.form) {
      fields = editorState.form.schema ?? [];
      metaColumns = editorState.form.metaColumns ?? [];
      settings = settingsOf(editorState.form);
    }
  });

  // Save implementation
  async function save() {
    if (!editorState.form) return;

    await api.updateForm(id, {
      title: settings.title,
      // Un champ vidé part tel quel : `undefined` serait ignoré par le serveur
      // et l'ancienne valeur resterait en base.
      description: settings.description,
      schema: fields,
      metaColumns,
      requireConsent: settings.requireConsent,
      consentText: settings.consentText,
      isAnonymized: settings.isAnonymized,
      encryptResponses: settings.encryptResponses,
      visibility: settings.visibility,
      allowedEmails: settings.allowedEmails,
      translations: settings.translations,
    });

    // Update parent context state to reflect changes instantly in the header
    editorState.form.title = settings.title;
    editorState.form.description = settings.description;
    editorState.form.schema = fields;
    editorState.form.metaColumns = metaColumns;
    editorState.form.requireConsent = settings.requireConsent;
    editorState.form.consentText = settings.consentText;
    editorState.form.isAnonymized = settings.isAnonymized;
    editorState.form.encryptResponses = settings.encryptResponses;
    editorState.form.visibility = settings.visibility;
    editorState.form.allowedEmails = settings.allowedEmails;
    editorState.form.translations = settings.translations;
  }

  // Register save function with the parent layout
  $effect(() => {
    editorState.saveCallback = save;
    return () => {
      editorState.saveCallback = null;
    };
  });

  // --- Enregistrement automatique & annulation ---

  const history = new EditHistory({
    snapshot: () => $state.snapshot({ fields, metaColumns, settings }),
    apply: (value) => {
      fields = value.fields as FieldDefinition[];
      metaColumns = value.metaColumns as MetaColumn[];
      settings = value.settings as typeof settings;
    },
  });

  $effect(() => {
    editorState.history = history as EditHistory<unknown>;
    return () => {
      editorState.history = null;
      history.dispose();
    };
  });

  // Un nouveau formulaire chargé remet l'historique à son état initial.
  // `untrack` : sans lui, l'instantané pris ici ferait dépendre l'effet de
  // tout l'éditeur, qui se réinitialiserait à chaque frappe.
  $effect(() => {
    if (!editorState.form?.id) return;
    untrack(() => history.reset());
  });

  /** État enregistré côté serveur : tant que l'éditeur n'en diverge pas, il
   *  n'y a rien à enregistrer ni à empiler dans l'historique. */
  const savedSignature = $derived(
    editorState.form
      ? JSON.stringify({
          fields: editorState.form.schema ?? [],
          metaColumns: editorState.form.metaColumns ?? [],
          settings: settingsOf(editorState.form),
        })
      : "",
  );

  // Sérialiser lit l'état en profondeur : l'effet se redéclenche donc pour
  // n'importe quelle modification, y compris à l'intérieur d'un champ.
  $effect(() => {
    const current = JSON.stringify({ fields, metaColumns, settings });
    if (current === savedSignature) return;
    untrack(() => {
      history.record();
      editorState.markDirty();
    });
  });
</script>

{#if editorState.form}
  <FormBuilder bind:fields bind:metaColumns bind:settings />
{/if}
