<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { User, FormSummary, FormAccessEntry } from "$lib/types.ts";
  import { IconKey, IconTrash, IconClose, IconCheck, IconPlus } from "$lib/icons.ts";

  let users = $state<User[]>([]);
  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Formulaire de création
  let nu = $state({ email: "", password: "", role: "EDITOR", displayName: "" });
  let creating = $state(false);

  // Gestion des accès
  let selectedFormId = $state("");
  let accessList = $state<FormAccessEntry[]>([]);
  let accessUserId = $state("");
  let accessPerm = $state<"READ" | "WRITE">("READ");

  onMount(async () => {
    try {
      const [u, f] = await Promise.all([api.listUsers(), api.listForms()]);
      users = u.users;
      forms = f.forms;
    } catch (e) {
      error = e instanceof Error ? e.message : "Chargement impossible.";
    } finally {
      loading = false;
    }
  });

  async function createUser(e: Event) {
    e.preventDefault();
    creating = true;
    error = null;
    try {
      const res = await api.createUser(nu);
      users = [...users, res.user];
      nu = { email: "", password: "", role: "EDITOR", displayName: "" };
    } catch (err) {
      error = err instanceof Error ? err.message : "Création impossible.";
    } finally {
      creating = false;
    }
  }

  async function toggleActive(u: User) {
    const res = await api.updateUser(u.id, { isActive: !u.isActive });
    Object.assign(u, res.user);
    users = [...users];
  }

  async function changeRole(u: User, role: string) {
    const res = await api.updateUser(u.id, { role });
    Object.assign(u, res.user);
    users = [...users];
  }

  async function resetPassword(u: User) {
    const pw = prompt(`Nouveau mot de passe pour ${u.email} (min. 10 caractères) :`);
    if (!pw) return;
    try {
      await api.updateUser(u.id, { password: pw });
      alert("Mot de passe mis à jour.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Échec.");
    }
  }

  async function removeUser(u: User) {
    if (!confirm(`Supprimer ${u.email} ?`)) return;
    try {
      await api.deleteUser(u.id);
      users = users.filter((x) => x.id !== u.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Échec.");
    }
  }

  async function loadAccess() {
    if (!selectedFormId) {
      accessList = [];
      return;
    }
    const res = await api.getForm(selectedFormId);
    accessList = res.form.access ?? [];
  }

  async function grant() {
    if (!selectedFormId || !accessUserId) return;
    try {
      await api.grantAccess(accessUserId, selectedFormId, accessPerm);
      await loadAccess();
      accessUserId = "";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Échec.");
    }
  }

  async function revoke(userId: string) {
    await api.revokeAccess(userId, selectedFormId);
    await loadAccess();
  }
</script>

<svelte:head><title>Utilisateurs — Admin</title></svelte:head>

{#if !auth.isSuperAdmin}
  <p class="text-red-600">Accès réservé aux Super Admins.</p>
{:else}
  <h1 class="mb-6 text-2xl font-bold">Utilisateurs &amp; accès</h1>
  {#if error}<p class="mb-3 text-sm text-red-600">{error}</p>{/if}

  <div class="grid gap-6 lg:grid-cols-3">
    <!-- Liste des utilisateurs -->
    <div class="lg:col-span-2">
      <div class="card overflow-x-auto">
        <h2 class="mb-3 font-semibold">Comptes</h2>
        {#if loading}
          <p class="text-gray-500">Chargement…</p>
        {:else}
          <table class="w-full text-sm">
            <thead class="text-left text-gray-500">
              <tr><th class="py-1">Email</th><th>Rôle</th><th>Actif</th><th></th></tr>
            </thead>
            <tbody>
              {#each users as u (u.id)}
                <tr class="border-t">
                  <td class="py-2">{u.email}{#if u.displayName}<span class="text-gray-400"> · {u.displayName}</span>{/if}</td>
                  <td>
                    <select class="input !py-1 text-xs" value={u.role} onchange={(e) => changeRole(u, (e.target as HTMLSelectElement).value)}>
                      <option value="EDITOR">Éditeur</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </select>
                  </td>
                  <td>
                    <button class="inline-flex items-center gap-1 text-xs {u.isActive ? 'text-brand-600' : 'text-gray-400'}" onclick={() => toggleActive(u)}>
                      {#if u.isActive}<IconCheck size={13} weight="bold" /> actif{:else}désactivé{/if}
                    </button>
                  </td>
                  <td class="text-right">
                    <button class="text-[color:var(--muted)] hover:text-[color:var(--ink)]" onclick={() => resetPassword(u)} aria-label="Réinitialiser le mot de passe"><IconKey size={16} /></button>
                    {#if u.id !== auth.user?.id}
                      <button class="ml-2 text-[color:var(--danger)]" onclick={() => removeUser(u)} aria-label="Supprimer"><IconTrash size={16} /></button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <!-- Création -->
      <form onsubmit={createUser} class="card mt-4">
        <h2 class="mb-3 font-semibold">Créer un compte</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <input class="input" type="email" placeholder="Email" bind:value={nu.email} required />
          <input class="input" type="text" placeholder="Nom affiché (facultatif)" bind:value={nu.displayName} />
          <input class="input" type="password" placeholder="Mot de passe (min. 10)" bind:value={nu.password} required minlength="10" />
          <select class="input" bind:value={nu.role}>
            <option value="EDITOR">Éditeur</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <button class="btn-primary mt-3" type="submit" disabled={creating}><IconPlus size={17} weight="bold" /> {creating ? "…" : "Créer"}</button>
      </form>
    </div>

    <!-- Gestion des accès -->
    <div class="card h-fit">
      <h2 class="mb-3 font-semibold">Accès par formulaire</h2>
      <label class="label">Formulaire</label>
      <select class="input mb-3" bind:value={selectedFormId} onchange={loadAccess}>
        <option value="">— Choisir —</option>
        {#each forms as f}<option value={f.id}>{f.title}</option>{/each}
      </select>

      {#if selectedFormId}
        <div class="mb-3">
          {#if accessList.length === 0}
            <p class="text-xs text-gray-400">Aucun accès délégué.</p>
          {:else}
            {#each accessList as a (a.id)}
              <div class="mb-1 flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm">
                <span>{a.user.email}</span>
                <span class="flex items-center gap-2">
                  <span class="rounded bg-gray-200 px-1.5 text-xs">{a.permission === "WRITE" ? "Édition" : "Lecture"}</span>
                  <button class="text-[color:var(--danger)]" onclick={() => revoke(a.userId)} aria-label="Révoquer"><IconClose size={13} /></button>
                </span>
              </div>
            {/each}
          {/if}
        </div>

        <label class="label">Ajouter un éditeur</label>
        <select class="input mb-2" bind:value={accessUserId}>
          <option value="">— Utilisateur —</option>
          {#each users.filter((u) => u.role === "EDITOR") as u}<option value={u.id}>{u.email}</option>{/each}
        </select>
        <select class="input mb-2" bind:value={accessPerm}>
          <option value="READ">Lecture seule</option>
          <option value="WRITE">Édition</option>
        </select>
        <button class="btn-secondary w-full text-sm" onclick={grant}>Accorder l'accès</button>
      {/if}
    </div>
  </div>
{/if}
