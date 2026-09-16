<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, setContext } from "svelte";
  import { goto, beforeNavigate } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { askConfirm } from "$lib/stores/dialog.svelte.ts";
  import Modal from "$lib/components/Modal.svelte";
  import { EditHistory } from "$lib/editHistory.svelte.ts";
  import type { FormVersion } from "$lib/types.ts";
  import { realtime, presenceTopic, type PresenceUser, type RealtimeEvent } from "$lib/stores/realtime.svelte.ts";
  import { IconBack, IconEye, IconTable, IconChartBar, IconSettings, IconExternal, IconCheck, IconClose, IconSave, IconCanvas, IconUndo, IconRedo, IconHistory, IconUser } from "$lib/icons.ts";
  import type { FormDetail, Permission } from "$lib/types.ts";

  let { children } = $props();

  // Reactive ID from route parameters
  const id = $derived($page.params.id);

  /** Inactivité au bout de laquelle les modifications partent au serveur. */
  const AUTOSAVE_DELAY_MS = 1200;

  // Shared state class for subpages
  class FormEditorState {
    form = $state<FormDetail | null>(null);
    /** Rôle effectif de l'utilisateur courant sur ce formulaire (cercle 1). */
    permission = $state<Permission>("NONE");
    loading = $state(true);
    saving = $state(false);
    saved = $state(false);
    /** Modifications pas encore parties au serveur. */
    dirty = $state(false);
    error = $state<string | null>(null);
    saveCallback = $state<(() => Promise<void>) | null>(null);
    /** Pile d'annulation de l'onglet actif, alimentée par les sous-pages. */
    history = $state<EditHistory<unknown> | null>(null);

    #autosaveTimer: ReturnType<typeof setTimeout> | null = null;

    async load(formId: string) {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.getForm(formId);
        this.form = res.form;
        this.permission = res.permission;
        this.dirty = false;
      } catch (e: any) {
        this.error = e.message || "Erreur de chargement du formulaire.";
      } finally {
        this.loading = false;
      }
    }

    /**
     * Signale une modification : l'enregistrement part tout seul une fois la
     * saisie retombée. Les lecteurs et commentateurs n'enregistrent rien- le
     * serveur refuserait la requête.
     */
    markDirty() {
      if (this.permission !== "EDITOR" || !this.saveCallback) return;
      this.dirty = true;
      if (this.#autosaveTimer) clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = setTimeout(() => {
        this.triggerSave().catch(() => {
          /* l'erreur est déjà affichée dans l'en-tête */
        });
      }, AUTOSAVE_DELAY_MS);
    }

    /** Enregistre sans attendre (quitter la page, masquer l'onglet). */
    flush() {
      if (!this.dirty) return;
      if (this.#autosaveTimer) clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = null;
      this.triggerSave().catch(() => {});
    }

    async triggerSave() {
      if (!this.saveCallback) return;
      if (this.#autosaveTimer) clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = null;
      this.saving = true;
      this.error = null;
      try {
        await this.saveCallback();
        this.dirty = false;
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

  // --- Présence : les autres collaborateurs ayant ce formulaire ouvert ---
  let others = $state<PresenceUser[]>([]);

  $effect(() => {
    if (!id) return;
    others = [];
    return realtime.subscribe([presenceTopic(id)], applyPresenceEvent);
  });

  function applyPresenceEvent(event: RealtimeEvent) {
    if (event.type === "presence:sync") {
      others = event.users.filter((user) => user.id !== auth.user?.id);
    } else if (event.type === "presence:join") {
      // On reçoit aussi sa propre arrivée, et une par onglet ouvert.
      if (event.user.id === auth.user?.id) return;
      if (others.some((user) => user.id === event.user.id)) return;
      others = [...others, event.user];
    } else if (event.type === "presence:leave") {
      others = others.filter((user) => user.id !== event.userId);
    }
  }

  function initials(name: string): string {
    const parts = name.split(/[\s.@_-]+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
    return letters.toUpperCase();
  }

  const presenceLabel = $derived(
    others.length === 1
      ? `${others[0].name} consulte aussi ce formulaire`
      : `${others.map((user) => user.name).join(", ")} consultent aussi ce formulaire`,
  );

  // --- Annuler / Rétablir (Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y) ---
  function handleShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;

    // Dans un champ de saisie, l'annulation native du navigateur reste plus
    // fine (caractère par caractère) : on la laisse faire.
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? "")) return;

    const history = editorState.history;
    if (!history) return;
    const wantsRedo = key === "y" || event.shiftKey;
    if (wantsRedo ? history.redo() : history.undo()) {
      event.preventDefault();
      editorState.markDirty();
    }
  }

  // Quitter l'écran ne doit pas perdre une modification encore en attente.
  beforeNavigate(() => editorState.flush());

  function handleVisibility() {
    if (document.visibilityState === "hidden") editorState.flush();
  }

  // --- Historique des versions ---
  let showHistory = $state(false);
  let versions = $state<FormVersion[]>([]);
  let versionsLoading = $state(false);
  let restoringId = $state<string | null>(null);

  async function openHistory() {
    const formId = editorState.form?.id;
    if (!formId) return;
    showHistory = true;
    versionsLoading = true;
    try {
      const res = await api.listFormVersions(formId);
      versions = res.versions;
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Historique indisponible.");
      showHistory = false;
    } finally {
      versionsLoading = false;
    }
  }

  async function restoreVersion(version: FormVersion) {
    const formId = editorState.form?.id;
    if (!formId) return;

    const ok = await askConfirm({
      title: "Restaurer cette version ?",
      message: `Le formulaire reviendra à son état du ${formatVersionDate(version.createdAt)}. L'état actuel reste récupérable dans l'historique.`,
      confirmLabel: "Restaurer",
    });
    if (!ok) return;

    restoringId = version.id;
    try {
      // La modification en attente part d'abord, sinon l'enregistrement
      // automatique réécrirait la version tout juste restaurée.
      editorState.flush();
      await api.restoreFormVersion(formId, version.id);
      await editorState.load(formId);
      showHistory = false;
      toasts.success("Version restaurée.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Restauration impossible.");
    } finally {
      restoringId = null;
    }
  }

  function formatVersionDate(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  }

  /**
   * L'aperçu recharge le formulaire depuis le serveur : sans ça, il peut
   * s'ouvrir avant que l'enregistrement automatique (avec son délai
   * d'inactivité) n'ait eu le temps de partir, et montrer une version
   * périmée.
   */
  async function openPreview(event: MouseEvent) {
    if (!editorState.dirty) return;
    event.preventDefault();
    try {
      await editorState.triggerSave();
    } catch {
      // l'erreur est déjà affichée dans l'en-tête
    }
    window.open(`/admin/forms/${id}/preview`, "_blank");
  }

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
  <title>{editorState.form ? `${editorState.form.title}- Édition` : "Chargement du formulaire..."}</title>
</svelte:head>

<svelte:window onkeydown={handleShortcut} onvisibilitychange={handleVisibility} />

<Modal
  open={showHistory}
  title="Historique des versions"
  description="Chaque entrée est l'état du formulaire avant une série de modifications."
  size="md"
  onclose={() => { showHistory = false; }}
>
  {#if versionsLoading}
    <p class="text-sm text-[color:var(--muted)]">Chargement…</p>
  {:else if versions.length === 0}
    <p class="text-sm text-[color:var(--muted)]">
      Aucune version antérieure pour l'instant : l'historique se remplit au fil des modifications.
    </p>
  {:else}
    <ul class="divide-y divide-[color:var(--line)]">
      {#each versions as version (version.id)}
        <li class="flex items-center justify-between gap-4 py-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[color:var(--ink)]">{formatVersionDate(version.createdAt)}</p>
            <p class="text-xs text-[color:var(--muted)] flex items-center gap-1 truncate">
              <IconUser size={12} />
              {version.author?.displayName || version.author?.email || "Auteur supprimé"}
            </p>
          </div>
          <button
            class="btn-secondary !py-1.5 !px-3 text-xs font-bold shrink-0"
            onclick={() => restoreVersion(version)}
            disabled={restoringId !== null}
          >
            {restoringId === version.id ? "Restauration…" : "Restaurer"}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Modal>

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
      <div class="mx-auto max-w-7xl px-4 md:px-0">
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
                  {:else if editorState.dirty}
                    Modifications en attente...
                  {:else if editorState.form}
                    Toutes les modifications sont enregistrées
                  {/if}
                </span>
              {/if}
            </div>
          </div>

          <!-- Right Section: Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- Qui d'autre a le formulaire ouvert en ce moment -->
            {#if others.length > 0}
              <div class="hidden sm:flex items-center -space-x-2 mr-1" aria-label={presenceLabel} title={presenceLabel}>
                {#each others.slice(0, 3) as user (user.id)}
                  <span class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-brand-50 text-[11px] font-bold text-brand-700">
                    {initials(user.name)}
                  </span>
                {/each}
                {#if others.length > 3}
                  <span class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[11px] font-bold text-[color:var(--muted)]">
                    +{others.length - 3}
                  </span>
                {/if}
              </div>
            {/if}

            <!-- Annuler / Rétablir / Historique -->
            {#if editorState.permission === "EDITOR"}
              <div class="flex items-center">
                <button
                  class="btn-text !p-2 rounded-full hover:bg-slate-100 transition disabled:opacity-30 disabled:hover:bg-transparent"
                  onclick={() => { if (editorState.history?.undo()) editorState.markDirty(); }}
                  disabled={!editorState.history?.canUndo}
                  title="Annuler (Ctrl+Z)"
                  aria-label="Annuler la dernière modification"
                >
                  <IconUndo size={18} />
                </button>
                <button
                  class="btn-text !p-2 rounded-full hover:bg-slate-100 transition disabled:opacity-30 disabled:hover:bg-transparent"
                  onclick={() => { if (editorState.history?.redo()) editorState.markDirty(); }}
                  disabled={!editorState.history?.canRedo}
                  title="Rétablir (Ctrl+Maj+Z)"
                  aria-label="Rétablir la modification annulée"
                >
                  <IconRedo size={18} />
                </button>
                <button
                  class="btn-text !p-2 rounded-full hover:bg-slate-100 transition"
                  onclick={openHistory}
                  title="Historique des versions"
                  aria-label="Ouvrir l'historique des versions"
                >
                  <IconHistory size={18} />
                </button>
              </div>
            {/if}

            <!-- Preview (Eye Icon) -->
            {#if editorState.form}
              <a
                href={`/admin/forms/${id}/preview`}
                target="_blank"
                class="btn-secondary !py-2 !px-3"
                title="Prévisualiser le formulaire"
                onclick={openPreview}
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

            <!-- L'enregistrement est automatique : ce bouton ne sert qu'à ne
                 pas attendre, quand une modification est encore en attente. -->
            {#if editorState.saveCallback && (editorState.dirty || editorState.saving)}
              <button
                class="btn-primary !py-2 !px-4"
                onclick={() => editorState.triggerSave()}
                disabled={editorState.saving}
              >
                <IconSave size={18} />
                <span>{editorState.saving ? "Envoi..." : "Enregistrer maintenant"}</span>
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
