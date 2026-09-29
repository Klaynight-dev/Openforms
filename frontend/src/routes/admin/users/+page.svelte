<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { askConfirm, askPrompt } from "$lib/stores/dialog.svelte.ts";
  import type { User, FormSummary, FormAccessEntry, FormRole } from "$lib/types.ts";
  import { IconKey, IconTrash, IconClose, IconCheck, IconPlus, IconSend, IconDuplicate } from "$lib/icons.ts";

  let users = $state<User[]>([]);
  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Formulaire de création
  let nu = $state({ email: "", role: "EDITOR", displayName: "" });
  let creating = $state(false);
  let inviteLink = $state<string | null>(null);
  let createError = $state<string | null>(null);
  let copied = $state(false);

  // Gestion des accès
  let selectedFormId = $state("");
  let accessList = $state<FormAccessEntry[]>([]);
  let accessUserId = $state("");
  let accessRole = $state<FormRole>("VIEWER");

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
    createError = null;
    inviteLink = null;
    copied = false;
    try {
      const res = await api.createUser({
        email: nu.email.trim(),
        role: nu.role,
        displayName: nu.displayName.trim() || undefined,
      });
      users = [...users, res.user];
      inviteLink = res.inviteLink;
      toasts.success(`Compte créé pour ${res.user.email}, invitation envoyée.`);
      nu = { email: "", role: "EDITOR", displayName: "" };
    } catch (err) {
      createError = err instanceof Error ? err.message : "Création impossible.";
    } finally {
      creating = false;
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* clipboard indisponible- le lien reste affiché pour copie manuelle */
    }
  }

  async function resendInvite(u: User) {
    try {
      const res = await api.resendInvite(u.id);
      inviteLink = res.inviteLink;
      copied = false;
      toasts.success(`Lien d'invitation renvoyé à ${u.email}, affiché ci-dessous.`);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Renvoi de l'invitation impossible.");
    }
  }

  async function toggleActive(u: User) {
    try {
      const res = await api.updateUser(u.id, { isActive: !u.isActive });
      users = users.map((x) => (x.id === u.id ? { ...x, ...res.user } : x));
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Mise à jour impossible.");
    }
  }

  async function changeRole(u: User, role: string) {
    try {
      const res = await api.updateUser(u.id, { role });
      users = users.map((x) => (x.id === u.id ? { ...x, ...res.user } : x));
    } catch (e) {
      // Le <select> affiche déjà le nouveau rôle : on le ramène à l'état réel.
      users = [...users];
      toasts.error(e instanceof Error ? e.message : "Changement de rôle impossible.");
    }
  }

  async function resetPassword(u: User) {
    const pw = await askPrompt({
      title: "Réinitialiser le mot de passe",
      message: `Le nouveau mot de passe sera actif immédiatement pour ${u.email}.`,
      label: "Nouveau mot de passe (10 caractères minimum)",
      confirmLabel: "Mettre à jour",
    });
    if (!pw) return;
    if (pw.length < 10) {
      toasts.error("Le mot de passe doit contenir au moins 10 caractères.");
      return;
    }
    try {
      await api.updateUser(u.id, { password: pw });
      toasts.success("Mot de passe mis à jour.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Mise à jour impossible.");
    }
  }

  async function removeUser(u: User) {
    const ok = await askConfirm({
      title: `Supprimer ${u.email} ?`,
      message: "Ce compte perdra définitivement l'accès à l'application.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      users = users.filter((x) => x.id !== u.id);
      toasts.success("Compte supprimé.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  let accessLoading = $state(false);
  let selectedForm = $derived(forms.find((f) => f.id === selectedFormId) ?? null);

  // Suivre la sélection par un effet plutôt que par `onchange` : l'ordre entre
  // ce gestionnaire et la mise à jour de `bind:value` n'est pas garanti.
  $effect(() => {
    const formId = selectedFormId;
    accessUserId = "";
    if (!formId) {
      accessList = [];
      return;
    }
    void loadAccess(formId);
  });

  async function loadAccess(formId: string) {
    accessLoading = true;
    try {
      const res = await api.getForm(formId);
      if (formId === selectedFormId) accessList = res.form.access ?? [];
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Chargement des accès impossible.");
    } finally {
      accessLoading = false;
    }
  }

  /** Comptes à qui l'on peut encore donner un accès : ni propriétaire, ni déjà invité, ni Super Admin. */
  let grantableUsers = $derived(
    users.filter(
      (u) =>
        u.role !== "SUPER_ADMIN" &&
        u.id !== selectedForm?.ownerId &&
        !accessList.some((a) => a.userId === u.id),
    ),
  );

  async function grant(e: Event) {
    e.preventDefault();
    if (!selectedFormId || !accessUserId) return;
    try {
      await api.grantAccess(accessUserId, selectedFormId, accessRole);
      await loadAccess(selectedFormId);
      accessUserId = "";
      toasts.success("Accès accordé.");
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Attribution de l'accès impossible.");
    }
  }

  async function revoke(userId: string) {
    try {
      await api.revokeAccess(userId, selectedFormId);
      accessList = accessList.filter((a) => a.userId !== userId);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Révocation impossible.");
    }
  }
</script>

<svelte:head><title>Utilisateurs- Admin</title></svelte:head>

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
          <table class="w-full text-sm animate-pulse">
            <thead class="text-left text-gray-500">
              <tr><th class="py-1">Email</th><th>Rôle</th><th>Actif</th><th></th></tr>
            </thead>
            <tbody>
              {#each [1, 2, 3, 4] as _}
                <tr class="border-t border-slate-100">
                  <td class="py-3 pr-4">
                    <div class="h-4 bg-slate-200 rounded-md w-3/4"></div>
                  </td>
                  <td class="py-3">
                    <div class="h-6 bg-slate-100 rounded-lg w-24"></div>
                  </td>
                  <td class="py-3">
                    <div class="h-4 bg-slate-200 rounded-md w-12"></div>
                  </td>
                  <td class="py-3 text-right">
                    <div class="inline-block h-6 bg-slate-100 rounded-lg w-12"></div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <table class="w-full text-sm">
            <thead class="text-left text-gray-500">
              <tr><th class="py-1">Email</th><th>Rôle</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {#each users as u (u.id)}
                <tr class="border-t">
                  <td class="py-2">{u.email}{#if u.displayName}<span class="text-gray-400"> · {u.displayName}</span>{/if}</td>
                  <td>
                    {#if u.id === auth.user?.id}
                      <span class="chip-muted">Super Admin (vous)</span>
                    {:else}
                      <select class="input !py-1 text-xs" value={u.role} aria-label="Rôle de {u.email}" onchange={(e) => changeRole(u, (e.target as HTMLSelectElement).value)}>
                        <option value="EDITOR">Éditeur</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </select>
                    {/if}
                  </td>
                  <td>
                    {#if u.hasPassword === false}
                      <span class="inline-flex items-center gap-1 text-xs text-amber-600" title="En attente de définition du mot de passe">
                        <IconSend size={13} weight="bold" /> invitation envoyée
                      </span>
                    {:else if u.id === auth.user?.id}
                      <span class="inline-flex items-center gap-1 text-xs text-brand-600"><IconCheck size={13} weight="bold" /> actif</span>
                    {:else}
                      <button
                        class="inline-flex items-center gap-1 text-xs {u.isActive ? 'text-brand-600' : 'text-gray-400'}"
                        onclick={() => toggleActive(u)}
                        title={u.isActive ? "Cliquer pour désactiver ce compte" : "Cliquer pour réactiver ce compte"}
                      >
                        {#if u.isActive}<IconCheck size={13} weight="bold" /> actif{:else}désactivé{/if}
                      </button>
                    {/if}
                  </td>
                  <td class="text-right">
                    {#if u.hasPassword === false}
                      <button class="text-[color:var(--muted)] hover:text-[color:var(--ink)]" onclick={() => resendInvite(u)} aria-label="Renvoyer l'invitation"><IconSend size={16} /></button>
                    {:else}
                      <button class="text-[color:var(--muted)] hover:text-[color:var(--ink)]" onclick={() => resetPassword(u)} aria-label="Réinitialiser le mot de passe"><IconKey size={16} /></button>
                    {/if}
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

      {#if inviteLink}
        <div class="card mt-4 border border-brand-100 bg-brand-50/50">
          <h2 class="mb-2 flex items-center gap-1.5 font-semibold text-brand-700"><IconSend size={16} /> Lien d'invitation</h2>
          <p class="mb-2 text-xs text-[color:var(--muted)]">Envoyez ce lien à la personne concernée pour qu'elle définisse son mot de passe (valable 48h).</p>
          <div class="flex items-center gap-2">
            <input class="input flex-1 text-xs" readonly value={inviteLink} onclick={(e) => (e.target as HTMLInputElement).select()} />
            <button type="button" class="btn-secondary shrink-0 text-xs" onclick={copyInviteLink}>
              <IconDuplicate size={14} /> {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>
      {/if}

      <!-- Création -->
      <form onsubmit={createUser} class="card mt-4">
        <h2 class="mb-3 font-semibold">Créer un compte</h2>
        <p class="mb-3 text-xs text-[color:var(--muted)]">
          La personne reçoit un lien pour choisir son mot de passe. Pour lui ouvrir des formulaires, ajoutez-la à une
          organisation depuis les paramètres de celle-ci (l'ajout y crée aussi le compte s'il n'existe pas).
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="sr-only" for="new-user-email">Email</label>
          <input id="new-user-email" class="input" type="email" placeholder="Email" autocomplete="off" bind:value={nu.email} required />
          <label class="sr-only" for="new-user-name">Nom affiché</label>
          <input id="new-user-name" class="input" type="text" placeholder="Nom affiché (facultatif)" bind:value={nu.displayName} />
          <label class="sr-only" for="new-user-role">Rôle</label>
          <select id="new-user-role" class="input" bind:value={nu.role}>
            <option value="EDITOR">Éditeur</option>
            <option value="SUPER_ADMIN">Super Admin (administre toute l'instance)</option>
          </select>
        </div>
        {#if createError}<p class="mt-2 text-sm text-[color:var(--danger)]" role="alert">{createError}</p>{/if}
        <button class="btn-primary mt-3" type="submit" disabled={creating || !nu.email.trim()}><IconPlus size={17} weight="bold" /> {creating ? "Création…" : "Créer et inviter"}</button>
      </form>
    </div>

    <!-- Gestion des accès -->
    <div class="card h-fit">
      <h2 class="mb-1 font-semibold">Accès à un formulaire</h2>
      <p class="mb-3 text-xs text-[color:var(--muted)]">Pour un accès ponctuel. Les membres d'une organisation ont déjà accès à tous ses formulaires.</p>
      <label class="label" for="access-form">Formulaire</label>
      <select id="access-form" class="input mb-3" bind:value={selectedFormId}>
        <option value="">Choisir un formulaire…</option>
        {#each forms as f (f.id)}<option value={f.id}>{f.title}</option>{/each}
      </select>

      {#if selectedFormId}
        <div class="mb-3">
          {#if accessLoading && accessList.length === 0}
            <p class="text-xs text-[color:var(--muted)]">Chargement…</p>
          {:else if accessList.length === 0}
            <p class="text-xs text-[color:var(--muted)]">Aucune personne invitée individuellement.</p>
          {:else}
            {#each accessList as a (a.id)}
              <div class="mb-1 flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm">
                <span class="min-w-0 truncate">{a.user.email}</span>
                <span class="flex items-center gap-2">
                  <span class="rounded bg-gray-200 px-1.5 text-xs">{{ VIEWER: "Lecture", COMMENTER: "Commentaire", EDITOR: "Édition" }[a.role]}</span>
                  <button class="text-[color:var(--danger)]" onclick={() => revoke(a.userId)} aria-label="Révoquer l'accès de {a.user.email}"><IconClose size={13} /></button>
                </span>
              </div>
            {/each}
          {/if}
        </div>

        <form onsubmit={grant}>
          <label class="label" for="access-user">Inviter une personne</label>
          <select id="access-user" class="input mb-2" bind:value={accessUserId}>
            <option value="">Choisir un compte…</option>
            {#each grantableUsers as u (u.id)}<option value={u.id}>{u.displayName ? `${u.displayName} (${u.email})` : u.email}</option>{/each}
          </select>
          <label class="sr-only" for="access-role">Niveau d'accès</label>
          <select id="access-role" class="input mb-2" bind:value={accessRole}>
            <option value="VIEWER">Lecture seule</option>
            <option value="COMMENTER">Commentaire</option>
            <option value="EDITOR">Édition</option>
          </select>
          <button class="btn-secondary w-full text-sm" type="submit" disabled={!accessUserId}>Accorder l'accès</button>
        </form>
      {/if}
    </div>
  </div>
{/if}
