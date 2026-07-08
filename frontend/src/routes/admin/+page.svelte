<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { FormSummary } from "$lib/types.ts";
  import {
    IconTable,
    IconEdit,
    IconTrash,
    IconLink,
    IconLock,
    IconEye,
    IconCheck,
    IconLeaf,
    IconClose,
  } from "$lib/icons.ts";

  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let openMenuId = $state<string | null>(null);

  // Multi-sélection
  let selected = $state<Set<string>>(new Set());
  let allSelected = $derived(forms.length > 0 && selected.size === forms.length);
  let someSelected = $derived(selected.size > 0);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function toggleAll() {
    if (allSelected) {
      selected = new Set();
    } else {
      selected = new Set(forms.map((f) => f.id));
    }
  }

  function clearSelection() {
    selected = new Set();
  }

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
      const next = new Set(selected);
      next.delete(f.id);
      selected = next;
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

  // --- Actions groupées ---
  async function bulkPublish(publish: boolean) {
    const ids = [...selected];
    await Promise.all(
      ids.map(async (id) => {
        const f = forms.find((x) => x.id === id);
        if (f && f.isPublished !== publish) {
          const res = await api.publishForm(id, publish);
          f.isPublished = res.isPublished;
        }
      })
    );
    forms = [...forms];
    clearSelection();
  }

  async function bulkDelete() {
    const ids = [...selected];
    const count = ids.length;
    if (!confirm(`Supprimer ${count} formulaire(s) et toutes leurs réponses ?`)) return;
    await Promise.all(ids.map((id) => api.deleteForm(id)));
    forms = forms.filter((f) => !ids.includes(f.id));
    clearSelection();
  }
</script>

<svelte:head><title>Formulaires — Admin</title></svelte:head>

<!-- En-tête -->
<div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <div class="flex items-center gap-3">
    <h1 class="text-2xl font-bold">Mes formulaires</h1>
    {#if forms.length > 0}
      <button
        class="flex items-center gap-2 text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)] transition px-2 py-1.5 rounded-lg hover:bg-slate-100"
        onclick={toggleAll}
      >
        <!-- Checkbox tout sélectionner -->
        <span class="relative flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition {allSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}">
          {#if allSelected}
            <IconCheck size={10} weight="bold" class="text-white" />
          {:else if someSelected}
            <span class="block h-1.5 w-1.5 rounded-sm bg-brand-400"></span>
          {/if}
        </span>
        {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
      </button>
    {/if}
  </div>
  {#if auth.isSuperAdmin}
    <button class="btn-primary w-full sm:w-auto" onclick={() => goto("/admin/forms/new")}>
      Nouveau formulaire
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
      {@const isSelected = selected.has(f.id)}
      <div
        class="card flex flex-col transition min-h-[190px] cursor-pointer relative {isSelected ? 'ring-2 ring-brand-500 shadow-lg shadow-brand-500/10' : 'hover:shadow-gform-hover'}"
        onclick={() => toggleSelect(f.id)}
        role="checkbox"
        aria-checked={isSelected}
        tabindex="0"
        onkeydown={(e) => e.key === " " && toggleSelect(f.id)}
      >
        <!-- Checkbox -->
        <span
          class="absolute top-3 right-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all {isSelected ? 'border-brand-500 bg-brand-500 scale-110' : 'border-slate-300 bg-white'}"
        >
          {#if isSelected}
            <IconCheck size={11} weight="bold" class="text-white" />
          {/if}
        </span>

        <div class="mb-2 flex items-start justify-between gap-2 pr-7">
          <h3 class="font-bold text-[color:var(--ink)] leading-snug truncate">{f.title}</h3>
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

        <div
          class="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100"
          onclick={(e) => e.stopPropagation()}
          role="none"
        >
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
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
                <circle cx="128" cy="60" r="12"/><circle cx="128" cy="128" r="12"/><circle cx="128" cy="196" r="12"/>
              </svg>
            </button>

            {#if openMenuId === f.id}
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

<!-- Barre d'actions groupées (flottante en bas) -->
{#if someSelected}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 shadow-2xl shadow-slate-900/15 animate-in">
    <span class="text-sm font-bold text-[color:var(--ink)] mr-1 shrink-0">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
    <div class="w-px h-5 bg-slate-200 mx-1"></div>
    {#if auth.isSuperAdmin}
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-100 transition"
        onclick={() => bulkPublish(true)}
      >
        <IconEye size={14} /> Publier
      </button>
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--muted)] hover:bg-slate-100 transition"
        onclick={() => bulkPublish(false)}
      >
        Dépublier
      </button>
      <div class="w-px h-5 bg-slate-200 mx-1"></div>
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--danger)] hover:bg-red-50 transition"
        onclick={bulkDelete}
      >
        <IconTrash size={14} /> Supprimer
      </button>
    {/if}
    <div class="w-px h-5 bg-slate-200 mx-1"></div>
    <button
      class="flex items-center justify-center h-7 w-7 rounded-full text-[color:var(--muted)] hover:bg-slate-100 transition"
      onclick={clearSelection}
      aria-label="Annuler la sélection"
    >
      <IconClose size={14} />
    </button>
  </div>
{/if}

<style>
  @keyframes animate-in {
    from { opacity: 0; transform: translateX(-50%) translateY(12px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .animate-in {
    animation: animate-in 0.2s ease-out both;
  }
</style>
