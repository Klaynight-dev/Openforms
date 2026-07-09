<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, setContext } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { IconBack, IconEye, IconTable, IconChartBar, IconSettings, IconExternal, IconCheck, IconClose, IconSave, IconCanvas } from "$lib/icons.ts";
  import type { FormDetail } from "$lib/types.ts";

  let { children } = $props();

  // Reactive ID from route parameters
  const id = $derived($page.params.id);

  // Shared state class for subpages
  class FormEditorState {
    form = $state<FormDetail | null>(null);
    loading = $state(true);
    saving = $state(false);
    saved = $state(false);
    error = $state<string | null>(null);
    saveCallback = $state<(() => Promise<void>) | null>(null);

    async load(formId: string) {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.getForm(formId);
        this.form = res.form;
      } catch (e: any) {
        this.error = e.message || "Erreur de chargement du formulaire.";
      } finally {
        this.loading = false;
      }
    }

    async triggerSave() {
      if (!this.saveCallback) return;
      this.saving = true;
      this.error = null;
      try {
        await this.saveCallback();
        this.saved = true;
        setTimeout(() => { this.saved = false; }, 2500);
      } catch (e: any) {
        this.error = e.message || "Erreur lors de la sauvegarde.";
        throw e;
      } finally {
        this.saving = false;
      }
    }
  }

  const editorState = new FormEditorState();
  setContext("form-editor-context", editorState);

  // Load form when the ID parameter is available
  $effect(() => {
    if (id) {
      editorState.load(id);
    }
  });

  // Derived variables for tab highlights
  const pathname = $derived($page.url.pathname);
  const activeTab = $derived.by(() => {
    if (pathname.endsWith("/preview")) return "preview";
    if (pathname.endsWith("/responses")) return "responses";
    if (pathname.endsWith("/stats")) return "stats";
    if (pathname.endsWith("/settings")) return "settings";
    return "questions";
  });

  async function togglePublish() {
    if (!editorState.form) return;
    try {
      const nextPublished = !editorState.form.isPublished;
      const res = await api.publishForm(editorState.form.id, nextPublished);
      editorState.form.isPublished = res.isPublished;
      editorState.form.slug = res.slug;
    } catch (e: any) {
      editorState.error = e.message || "Action de publication impossible.";
    }
  }
</script>

<svelte:head>
  <title>{editorState.form ? `${editorState.form.title} — Édition` : "Chargement du formulaire..."}</title>
</svelte:head>

<div class="min-h-screen bg-[color:var(--surface-bg)] flex flex-col">
  {#if activeTab === "preview"}
    {#if editorState.loading}
      <div class="min-h-screen bg-[color:var(--surface-bg)] pt-16 pb-12">
        <main class="mx-auto max-w-2xl px-4 animate-pulse space-y-6">
          <div class="gform-card has-banner mb-5">
            <div class="w-full h-24 bg-slate-200 rounded-t-2xl"></div>
            <div class="p-6 md:p-8">
              <div class="h-8 bg-slate-200 rounded-md w-3/4 mb-4"></div>
              <div class="h-4 bg-slate-200 rounded-md w-full mb-2"></div>
              <div class="h-4 bg-slate-200 rounded-md w-5/6"></div>
            </div>
          </div>
          <div class="space-y-4">
            {#each [1, 2, 3] as _}
              <div class="rounded-xl border border-[color:var(--line)] bg-white p-6 shadow-sm">
                <div class="h-4 bg-slate-200 rounded-md w-1/3 mb-3"></div>
                <div class="h-10 bg-slate-100 rounded-xl w-full"></div>
              </div>
            {/each}
          </div>
        </main>
      </div>
    {:else}
      {@render children()}
    {/if}
  {:else}
    <!-- Google Forms Header Bar -->
    <header class="bg-white border-b border-[color:var(--line)] sticky top-0 z-30 shadow-sm">
      <div class="mx-auto max-w-none px-6 sm:px-10">
        <div class="flex items-center justify-between py-3">
          <!-- Left Section: Back, Title, and Save status -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <button 
              class="btn-text !p-2 rounded-full hover:bg-slate-100 transition shrink-0" 
              onclick={() => goto("/admin")} 
              title="Retour à l'administration"
            >
              <IconBack size={18} />
            </button>
            
            <div class="flex flex-col min-w-0">
              {#if editorState.loading}
                <div class="h-4 bg-slate-200 rounded-md w-36 animate-pulse mb-1"></div>
                <div class="h-3 bg-slate-100 rounded-md w-24 animate-pulse"></div>
              {:else}
                <span class="text-sm font-bold truncate text-[color:var(--ink)]">
                  {editorState.form?.title || "Sans titre"}
                </span>
                <span class="text-[10px] text-[color:var(--muted)] flex items-center gap-1">
                  {#if editorState.saving}
                    Enregistrement...
                  {:else if editorState.saved}
                    <span class="text-green-600 flex items-center gap-0.5"><IconCheck size={12} weight="bold" /> Enregistré dans le cloud</span>
                  {:else if editorState.form}
                    Modifications prêtes à être sauvegardées
                  {/if}
                </span>
              {/if}
            </div>
          </div>

          <!-- Right Section: Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- Preview (Eye Icon) -->
            {#if editorState.form}
              <a 
                href={`/admin/forms/${id}/preview`} 
                target="_blank" 
                class="btn-secondary !py-2 !px-3" 
                title="Prévisualiser le formulaire"
              >
                <IconEye size={18} />
                <span class="hidden sm:inline">Prévisualiser</span>
              </a>
            {/if}

            <!-- Publish State Toggle -->
            {#if editorState.form}
              <button 
                class="btn-secondary !py-2 !px-3" 
                onclick={togglePublish}
                title={editorState.form.isPublished ? "Dépublier le formulaire" : "Publier le formulaire"}
              >
                <span class="w-2.5 h-2.5 rounded-full shrink-0" class:bg-green-500={editorState.form.isPublished} class:bg-slate-300={!editorState.form.isPublished}></span>
                <span>{editorState.form.isPublished ? "Publié" : "Brouillon"}</span>
              </button>
            {/if}

            <!-- Save Button (Only shown if saveCallback is registered) -->
            {#if editorState.saveCallback}
              <button 
                class="btn-primary !py-2 !px-4" 
                onclick={() => editorState.triggerSave()} 
                disabled={editorState.saving}
              >
                <IconSave size={18} />
                <span>{editorState.saving ? "Envoi..." : "Sauvegarder"}</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- Tab Navigation Center -->
        <div class="flex justify-center border-t border-[color:var(--line)]">
          <nav class="flex gap-6 sm:gap-10 text-sm font-medium">
            <a 
              href={`/admin/forms/${id}`} 
              class="py-3 border-b-2 px-1 transition-all flex items-center gap-1.5"
              class:border-transparent={activeTab !== "questions"}
              class:text-[color:var(--muted)]={activeTab !== "questions"}
              class:border-[color:var(--brand)]={activeTab === "questions"}
              class:text-[color:var(--brand)]={activeTab === "questions"}
            >
              <IconCanvas size={16} />
              <span>Questions</span>
            </a>
            <a 
              href={`/admin/forms/${id}/responses`} 
              class="py-3 border-b-2 px-1 transition-all flex items-center gap-1.5"
              class:border-transparent={activeTab !== "responses"}
              class:text-[color:var(--muted)]={activeTab !== "responses"}
              class:border-[color:var(--brand)]={activeTab === "responses"}
              class:text-[color:var(--brand)]={activeTab === "responses"}
            >
              <IconTable size={16} />
              <span>Réponses</span>
            </a>
            <a 
              href={`/admin/forms/${id}/stats`} 
              class="py-3 border-b-2 px-1 transition-all flex items-center gap-1.5"
              class:border-transparent={activeTab !== "stats"}
              class:text-[color:var(--muted)]={activeTab !== "stats"}
              class:border-[color:var(--brand)]={activeTab === "stats"}
              class:text-[color:var(--brand)]={activeTab === "stats"}
            >
              <IconChartBar size={16} />
              <span>Statistiques</span>
            </a>
            <a 
              href={`/admin/forms/${id}/settings`}
              class="py-3 border-b-2 px-1 transition-all flex items-center gap-1.5"
              class:border-transparent={activeTab !== "settings"}
              class:text-[color:var(--muted)]={activeTab !== "settings"}
              class:border-[color:var(--brand)]={activeTab === "settings"}
              class:text-[color:var(--brand)]={activeTab === "settings"}
            >
              <IconSettings size={16} />
              <span>Paramètres</span>
            </a>
          </nav>
        </div>
      </div>
    </header>

    <!-- Error display if any -->
    {#if editorState.error}
      <div class="mx-auto max-w-2xl w-full px-4 mt-4">
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between text-sm shadow-sm">
          <span>{editorState.error}</span>
          <button onclick={() => { editorState.error = null; }} class="text-red-700 hover:text-red-900 shrink-0"><IconClose size={16} /></button>
        </div>
      </div>
    {/if}

    <!-- Page Content Container -->
    <main class="flex-1 w-full py-6">
      {#if editorState.loading}
        <div class="mx-auto max-w-2xl px-4 py-6 space-y-6 animate-pulse">
          <!-- Title / Desc Card Skeleton -->
          <div class="rounded-2xl border border-[color:var(--line)] bg-white p-6 shadow-sm">
            <div class="h-8 bg-slate-200 rounded-md w-1/3 mb-4"></div>
            <div class="h-4 bg-slate-200 rounded-md w-full mb-2"></div>
            <div class="h-4 bg-slate-200 rounded-md w-2/3"></div>
          </div>
          <!-- Field Skeletons -->
          {#each [1, 2] as _}
            <div class="rounded-2xl border border-[color:var(--line)] bg-white p-6 shadow-sm">
              <div class="flex items-center justify-between gap-4 mb-4">
                <div class="h-5 bg-slate-200 rounded-md w-1/4"></div>
                <div class="h-8 bg-slate-100 rounded-lg w-32"></div>
              </div>
              <div class="h-10 bg-slate-50 rounded-xl w-full"></div>
            </div>
          {/each}
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  {/if}
</div>
