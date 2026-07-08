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
  let openMenuId = $state<string | null>(null);

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

<div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <h1 class="text-2xl font-bold">Mes formulaires</h1>
  {#if auth.isSuperAdmin}
    <button class="btn-primary w-full sm:w-auto" onclick={() => goto("/admin/forms/new")}>
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
      <div class="card flex flex-col transition hover:shadow-gform-hover min-h-[190px]">
        <div class="mb-2 flex items-start justify-between gap-2">
          <h3 class="font-bold text-[color:var(--ink)] leading-snug truncate max-w-[70%]">{f.title}</h3>
          {#if f.isPublished}
            <span class="chip shrink-0"><IconCheck size={12} weight="bold" /> Publié</span>
          {:else}
            <span class="chip-muted shrink-0">Brouillon</span>
          {/if}
        </div>
        <p class="mb-3 flex-1 text-sm text-[color:var(--muted)] line-clamp-2">{f.description ?? "Aucune description."}</p>
        <div class="mb-4 flex items-center gap-3 text-xs font-semibold text-[color:var(--muted)]">
          <span class="flex items-center gap-1"><IconTable size={14} /> {f._count?.responses ?? 0} réponse(s)</span>
          {#if f.isAnonymized}<span class="flex items-center gap-1"><IconLock size={14} /> Anonyme</span>{/if}
        </div>
        
        <div class="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100">
          <button class="btn-secondary flex-1 !px-3 !py-2 text-xs" onclick={() => goto(`/admin/forms/${f.id}/responses`)}>
            <IconTable size={15} /> Réponses
          </button>
          {#if auth.isSuperAdmin}
            <button class="btn-secondary flex-1 !px-3 !py-2 text-xs" onclick={() => goto(`/admin/forms/${f.id}`)}>
              <IconEdit size={15} /> Éditer
            </button>
          {/if}
          
          <!-- Menu dropdown -->
          <div class="relative">
            <button 
              class="btn-secondary !p-2 text-xs" 
              onclick={(e) => { e.stopPropagation(); openMenuId = openMenuId === f.id ? null : f.id; }}
              aria-label="Plus d'actions"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            
            {#if openMenuId === f.id}
              <!-- Click outside overlay to close -->
              <div class="fixed inset-0 z-30" onclick={() => openMenuId = null} role="none"></div>
              
              <div class="absolute right-0 bottom-full mb-2 w-48 rounded-xl border border-[color:var(--line)] bg-white p-1.5 shadow-xl z-40 text-left">
                {#if auth.isSuperAdmin}
                  <button 
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                    onclick={() => { openMenuId = null; togglePublish(f); }}
                  >
                    <IconEye size={14} /> {f.isPublished ? "Dépublier" : "Publier"}
                  </button>
                {/if}
                {#if f.isPublished}
                  <button 
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                    onclick={() => { openMenuId = null; copyLink(f.slug); }}
                  >
                    <IconLink size={14} /> Copier le lien
                  </button>
                {/if}
                {#if auth.isSuperAdmin}
                  <hr class="my-1 border-slate-100" />
                  <button 
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--danger)] hover:bg-red-50 transition"
                    onclick={() => { openMenuId = null; remove(f); }}
                  >
                    <IconTrash size={14} /> Supprimer
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
