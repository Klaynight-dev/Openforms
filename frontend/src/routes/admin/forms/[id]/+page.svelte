<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import type { FieldDefinition, MetaColumn, FormDetail } from "$lib/types.ts";
  import { IconSave, IconBack, IconEye, IconTable, IconExternal, IconCheck } from "$lib/icons.ts";

  const id = $page.params.id as string;

  let form = $state<FormDetail | null>(null);
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
  });

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  onMount(async () => {
    try {
      const res = await api.getForm(id);
      form = res.form;
      fields = res.form.schema ?? [];
      metaColumns = res.form.metaColumns ?? [];
      settings = {
        title: res.form.title,
        description: res.form.description ?? "",
        requireConsent: res.form.requireConsent,
        consentText: res.form.consentText ?? "",
        isAnonymized: res.form.isAnonymized,
        encryptResponses: res.form.encryptResponses,
        visibility: res.form.visibility ?? "PUBLIC",
        allowedEmails: res.form.allowedEmails ?? [],
      };
    } catch (e) {
      error = e instanceof Error ? e.message : "Formulaire introuvable.";
    } finally {
      loading = false;
    }
  });

  async function save() {
    saving = true;
    error = null;
    saved = false;
    try {
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
      });
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Enregistrement impossible.";
    } finally {
      saving = false;
    }
  }

  async function togglePublish() {
    if (!form) return;
    const res = await api.publishForm(id, !form.isPublished);
    form.isPublished = res.isPublished;
  }
</script>

<svelte:head><title>Éditer — {settings.title}</title></svelte:head>

{#if loading}
  <p class="text-gray-500">Chargement…</p>
{:else if error && !form}
  <p class="text-red-600">{error}</p>
{:else}
  <!-- Header responsive : titre + actions -->
  <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <!-- Ligne 1 : retour + titre + lien public -->
    <div class="flex items-center gap-2 min-w-0">
      <button class="btn-text !px-2 shrink-0" onclick={() => goto("/admin")}><IconBack size={18} /></button>
      <h1 class="text-lg font-bold truncate min-w-0">Éditer le formulaire</h1>
      {#if form?.isPublished}
        <a class="flex items-center gap-1 text-xs text-brand-600 hover:underline shrink-0" href={`/f/${form.slug}`} target="_blank">
          <IconExternal size={13} />
        </a>
      {/if}
    </div>
    <!-- Ligne 2 : actions -->
    <div class="flex items-center gap-2 flex-wrap">
      {#if saved}<span class="flex items-center gap-1 text-sm text-brand-600 shrink-0"><IconCheck size={15} weight="bold" /> Enregistré</span>{/if}
      <button class="btn-secondary shrink-0" onclick={togglePublish}>
        <IconEye size={17} /> {form?.isPublished ? "Dépublier" : "Publier"}
      </button>
      <button class="btn-secondary shrink-0" onclick={() => goto(`/admin/forms/${id}/responses`)}><IconTable size={17} /> Réponses</button>
      <button class="btn-primary shrink-0" onclick={save} disabled={saving}><IconSave size={17} /> {saving ? "…" : "Enregistrer"}</button>
    </div>
  </div>
  {#if error}<p class="mb-3 text-sm text-red-600">{error}</p>{/if}

  <FormBuilder bind:fields bind:metaColumns bind:settings />
{/if}
