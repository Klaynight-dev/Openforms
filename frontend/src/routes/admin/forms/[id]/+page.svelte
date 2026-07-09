<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { page } from "$app/stores";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import type { FieldDefinition, MetaColumn, FormDetail } from "$lib/types.ts";

  const editorState = getContext<{
    form: FormDetail | null;
    saving: boolean;
    saved: boolean;
    error: string | null;
    saveCallback: (() => Promise<void>) | null;
  }>("form-editor-context");

  const id = $page.params.id as string;

  let fields = $state<FieldDefinition[]>([]);
  let metaColumns = $state<MetaColumn[]>([]);
  let settings = $state({
    title: "",
    description: "",
    requireConsent: true,
    consentText: "",
    isAnonymized: false,
    encryptResponses: false,
    visibility: "PUBLIC",
    allowedEmails: [] as string[],
    translations: {} as any,
  });

  // Sync settings when form changes or is loaded
  $effect(() => {
    if (editorState.form) {
      fields = editorState.form.schema ?? [];
      metaColumns = editorState.form.metaColumns ?? [];
      settings = {
        title: editorState.form.title,
        description: editorState.form.description ?? "",
        requireConsent: editorState.form.requireConsent,
        consentText: editorState.form.consentText ?? "",
        isAnonymized: editorState.form.isAnonymized,
        encryptResponses: editorState.form.encryptResponses,
        visibility: editorState.form.visibility ?? "PUBLIC",
        allowedEmails: editorState.form.allowedEmails ?? [],
        translations: editorState.form.translations ?? {},
      };
    }
  });

  // Save implementation
  async function save() {
    if (!editorState.form) return;
    
    await api.updateForm(id, {
      title: settings.title,
      description: settings.description || undefined,
      schema: fields,
      metaColumns,
      requireConsent: settings.requireConsent,
      consentText: settings.consentText || undefined,
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
</script>

{#if editorState.form}
  <FormBuilder bind:fields bind:metaColumns bind:settings />
{/if}
