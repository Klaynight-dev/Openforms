<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { FormSummary } from "$lib/types.ts";
  import {
    IconPlus,
    IconTable,
    IconEdit,
    IconTrash,
    IconLink,
    IconLock,
    IconEye,
    IconCheck,
    IconLeaf,
  } from "$lib/icons.ts";

  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(load);

  async function load() {
    loading = true;
    try {
      const res = await api.listForms();
      forms = res.forms;
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur de chargement.";
    } finally {
      loading = false;
    }
  }

  async function togglePublish(f: FormSummary) {
    try {
      const res = await api.publishForm(f.id, !f.isPublished);
      f.isPublished = res.isPublished;
      forms = [...forms];
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  async function remove(f: FormSummary) {
    if (!confirm(`Supprimer « ${f.title} » et toutes ses réponses ?`)) return;
    try {
      await api.deleteForm(f.id);
      forms = forms.filter((x) => x.id !== f.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  function publicUrl(slug: string) {
    return `${location.origin}/f/${slug}`;
  }

  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(publicUrl(slug));
    alert("Lien copié !");
  }
</script>

<svelte:head><title>Formulaires — Admin</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
  <h1 class="text-2xl font-bold">Mes formulaires</h1>
  {#if auth.isSuperAdmin}
    <button class="btn-primary" onclick={() => goto("/admin/forms/new")}>
      <IconPlus size={18} weight="bold" /> Nouveau formulaire
    </button>
  {/if}
</div>

{#if loading}
  <p class="text-[color:var(--muted)]">Chargement…</p>
{:else if error}
  <p class="text-[color:var(--danger)]">{error}</p>
{:else if forms.length === 0}
  <div class="card flex flex-col items-center gap-3 py-12 text-center text-[color:var(--muted)]">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
      <IconLeaf size={26} weight="fill" />
    </span>
    Aucun formulaire pour le moment.
  </div>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each forms as f (f.id)}
      <div class="card flex flex-col transition hover:shadow-gform-hover">
        <div class="mb-2 flex items-start justify-between gap-2">
          <h3 class="font-semibold">{f.title}</h3>
          {#if f.isPublished}
            <span class="chip"><IconCheck size={13} weight="bold" /> Publié</span>
          {:else}
            <span class="chip-muted">Brouillon</span>
          {/if}
        </div>
        <p class="mb-3 flex-1 text-sm text-[color:var(--muted)]">{f.description ?? "—"}</p>
        <div class="mb-3 flex items-center gap-3 text-xs text-[color:var(--muted)]">
          <span class="flex items-center gap-1"><IconTable size={14} /> {f._count?.responses ?? 0} réponse(s)</span>
          {#if f.isAnonymized}<span class="flex items-center gap-1"><IconLock size={14} /> anonyme</span>{/if}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={() => goto(`/admin/forms/${f.id}/responses`)}>
            <IconTable size={15} /> Réponses
          </button>
          {#if auth.isSuperAdmin}
            <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={() => goto(`/admin/forms/${f.id}`)}>
              <IconEdit size={15} /> Éditer
            </button>
            <button class="btn-text !px-2 !py-1.5 text-xs" onclick={() => togglePublish(f)}>
              <IconEye size={15} /> {f.isPublished ? "Dépublier" : "Publier"}
            </button>
          {/if}
          {#if f.isPublished}
            <button class="btn-text !px-2 !py-1.5 text-xs" onclick={() => copyLink(f.slug)}>
              <IconLink size={15} /> Lien
            </button>
          {/if}
          {#if auth.isSuperAdmin}
            <button class="btn-text !px-2 !py-1.5 text-xs !text-[color:var(--danger)]" onclick={() => remove(f)}>
              <IconTrash size={15} />
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
