<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Tableur from "$components/Tableur.svelte";
  import { api } from "$api/client.ts";
  import type { FieldDefinition, MetaColumn, ResponseRow, FormDetail } from "$lib/types.ts";
  import { IconBack, IconEdit, IconEye } from "$lib/icons.ts";

  const id = $page.params.id as string;

  let title = $state("Réponses");
  let fields = $state<FieldDefinition[]>([]);
  let metaColumns = $state<MetaColumn[]>([]);
  let rows = $state<ResponseRow[]>([]);
  let canEdit = $state(false);
  let detail = $state<FormDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const [res, formRes] = await Promise.all([api.listResponses(id), api.getForm(id).catch(() => null)]);
      title = res.form.title;
      fields = res.form.schema;
      metaColumns = res.form.metaColumns;
      rows = res.rows;
      canEdit = res.permission === "WRITE";
      if (formRes) detail = formRes.form;
    } catch (e) {
      error = e instanceof Error ? e.message : "Chargement impossible.";
    } finally {
      loading = false;
    }
  });

  // Persiste les colonnes de métadonnées ajoutées/retirées dans le tableur.
  async function persistColumns(cols: MetaColumn[]) {
    if (!detail) return;
    try {
      await api.updateForm(id, {
        title: detail.title,
        description: detail.description ?? undefined,
        schema: fields,
        metaColumns: cols,
        requireConsent: detail.requireConsent,
        consentText: detail.consentText ?? undefined,
        isAnonymized: detail.isAnonymized,
        encryptResponses: detail.encryptResponses,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'enregistrer les colonnes.");
    }
  }
</script>

<svelte:head><title>Réponses — {title}</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
  <button class="btn-text !px-2" onclick={() => goto("/admin")}><IconBack size={18} /></button>
  <h1 class="text-2xl font-bold">{title}</h1>
  <span class="chip-muted">
    {#if canEdit}<IconEdit size={13} /> Édition{:else}<IconEye size={13} /> Lecture seule{/if}
  </span>
</div>

{#if loading}
  <p class="text-gray-500">Chargement…</p>
{:else if error}
  <p class="text-red-600">{error}</p>
{:else}
  <Tableur
    formId={id}
    formTitle={title}
    {fields}
    bind:metaColumns
    bind:rows
    {canEdit}
    onMetaColumnsChange={persistColumns}
  />
{/if}
