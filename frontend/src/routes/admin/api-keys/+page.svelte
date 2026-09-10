<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$api/client.ts";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import Modal from "$lib/components/Modal.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { IconKey, IconPlus, IconTrash, IconClipboard, IconWarning } from "$lib/icons.ts";
  import type { ApiKeyInfo } from "$lib/types.ts";

  let keys = $state<ApiKeyInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let createOpen = $state(false);
  let newName = $state("");
  let creating = $state(false);

  /** Token en clair, affiché une seule fois après création. */
  let freshToken = $state<string | null>(null);

  async function load() {
    try {
      keys = (await api.listApiKeys()).keys;
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur de chargement.";
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    creating = true;
    try {
      const res = await api.createApiKey(name);
      freshToken = res.token;
      createOpen = false;
      newName = "";
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la création.");
    } finally {
      creating = false;
    }
  }

  async function revoke(key: ApiKeyInfo) {
    if (!confirm(`Révoquer définitivement la clé « ${key.name} » ?`)) return;
    try {
      await api.deleteApiKey(key.id);
      keys = keys.filter((k) => k.id !== key.id);
      toasts.success("Clé révoquée.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la révocation.");
    }
  }

  async function copyToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      toasts.success("Clé copiée dans le presse-papiers.");
    } catch {
      toasts.error("Copie impossible : sélectionnez la clé manuellement.");
    }
  }

  function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString("fr-FR") : "—";
  }
</script>

<svelte:head><title>Clés d'API — Humanitour</title></svelte:head>

<div class="mx-auto max-w-4xl">
  <div class="flex items-center gap-3 mb-2">
    <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
      <IconKey size={20} />
    </span>
    <div class="flex-1">
      <h1 class="text-xl font-bold text-[color:var(--ink)]">Clés d'API</h1>
      <p class="text-sm text-[color:var(--muted)]">
        Pour connecter un client externe (serveur MCP, script) à votre compte.
      </p>
    </div>
    <button class="btn-primary shrink-0" onclick={() => { newName = ""; createOpen = true; }}>
      <IconPlus size={16} /> Nouvelle clé
    </button>
  </div>

  <p class="text-xs text-[color:var(--muted)] mb-6">
    Une clé porte exactement vos droits : elle ne donne accès à rien de plus que votre compte.
    Révoquez-la dès qu'elle n'est plus utilisée.
  </p>

  {#if loading}
    <div class="animate-pulse space-y-3">
      {#each [1, 2] as _}
        <div class="h-16 bg-white border border-[color:var(--line)] rounded-2xl"></div>
      {/each}
    </div>
  {:else if error}
    <p class="text-sm text-[color:var(--danger)] bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      {error}
    </p>
  {:else if keys.length === 0}
    <EmptyState
      title="Aucune clé d'API"
      hint="Créez une clé pour brancher le serveur MCP Openforms sur votre compte."
    />
  {:else}
    <div class="bg-white border border-[color:var(--line)] rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 border-b border-[color:var(--line)]">
          <tr>
            <th class="text-left py-2.5 px-4 text-xs font-bold text-[color:var(--muted)] uppercase tracking-wide">Nom</th>
            <th class="text-left py-2.5 px-4 text-xs font-bold text-[color:var(--muted)] uppercase tracking-wide">Créée le</th>
            <th class="text-left py-2.5 px-4 text-xs font-bold text-[color:var(--muted)] uppercase tracking-wide">Dernier usage</th>
            <th class="py-2.5 px-4"></th>
          </tr>
        </thead>
        <tbody>
          {#each keys as key (key.id)}
            <tr class="border-b border-[color:var(--line)] last:border-0">
              <td class="py-3 px-4 font-medium text-[color:var(--ink)]">{key.name}</td>
              <td class="py-3 px-4 text-[color:var(--muted)]">{formatDate(key.createdAt)}</td>
              <td class="py-3 px-4 text-[color:var(--muted)]">{formatDate(key.lastUsedAt)}</td>
              <td class="py-3 px-4 text-right">
                <button class="btn-chip !text-red-600" onclick={() => revoke(key)}>
                  <IconTrash size={13} /> Révoquer
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Création -->
<Modal
  open={createOpen}
  title="Nouvelle clé d'API"
  description="Donnez-lui un nom qui rappelle où elle est utilisée."
  size="sm"
  dismissible={!creating}
  onclose={() => (createOpen = false)}
>
  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1" for="key-name">
    Nom
  </label>
  <input
    id="key-name"
    class="input w-full"
    bind:value={newName}
    placeholder="Ex. Serveur MCP — poste perso"
    onkeydown={(e) => { if (e.key === "Enter") create(); }}
  />

  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={() => (createOpen = false)}>Annuler</button>
    <button type="button" class="btn-primary" disabled={creating || !newName.trim()} onclick={create}>
      {creating ? "Création…" : "Créer"}
    </button>
  {/snippet}
</Modal>

<!-- Token affiché une seule fois -->
<Modal
  open={freshToken !== null}
  title="Clé créée"
  size="md"
  onclose={() => (freshToken = null)}
>
  <div class="flex gap-2 items-start text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
    <span class="shrink-0 mt-0.5"><IconWarning size={15} /></span>
    <p>
      Copiez cette clé maintenant : seule son empreinte est conservée, elle ne pourra plus être
      affichée. En cas de perte, révoquez-la et créez-en une nouvelle.
    </p>
  </div>

  <code
    class="block w-full break-all rounded-xl bg-slate-900 text-slate-100 px-3 py-2.5 text-xs font-mono select-all"
  >{freshToken}</code>

  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={copyToken}>
      <IconClipboard size={15} /> Copier
    </button>
    <button type="button" class="btn-primary" onclick={() => (freshToken = null)}>J'ai copié</button>
  {/snippet}
</Modal>
