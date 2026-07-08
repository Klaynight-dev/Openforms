<script lang="ts">
  import { goto } from "$app/navigation";
  import FormBuilder from "$components/FormBuilder.svelte";
  import { api } from "$api/client.ts";
  import type { FieldDefinition, MetaColumn } from "$lib/types.ts";
  import { IconSave, IconBack } from "$lib/icons.ts";

  import { page } from "$app/stores";

  let fields = $state<FieldDefinition[]>([]);
  let metaColumns = $state<MetaColumn[]>([]);
  let settings = $state({
    title: "",
    description: "",
    requireConsent: true,
    consentText: "J'accepte que mes réponses soient traitées conformément au RGPD.",
    isAnonymized: false,
    encryptResponses: false,
  });
  let saving = $state(false);
  let error = $state<string | null>(null);

  const orgId = $derived($page.url.searchParams.get("orgId") || undefined);

  async function save() {
    if (!settings.title.trim()) {
      error = "Le titre est requis.";
      return;
    }
    saving = true;
    error = null;
    try {
      const res = await api.createForm({
        title: settings.title,
        description: settings.description || undefined,
        schema: fields,
        metaColumns,
        requireConsent: settings.requireConsent,
        consentText: settings.consentText || undefined,
        isAnonymized: settings.isAnonymized,
        encryptResponses: settings.encryptResponses,
        organizationId: orgId,
      });
      goto(`/admin/forms/${res.form.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Enregistrement impossible.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Nouveau formulaire</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
  <h1 class="text-2xl font-bold">Nouveau formulaire</h1>
  <div class="flex gap-2">
    <button class="btn-secondary" onclick={() => goto("/admin")}><IconBack size={17} /> Annuler</button>
    <button class="btn-primary" onclick={save} disabled={saving}><IconSave size={17} /> {saving ? "…" : "Enregistrer"}</button>
  </div>
</div>
{#if error}<p class="mb-3 text-sm text-red-600">{error}</p>{/if}

<FormBuilder bind:fields bind:metaColumns bind:settings />
