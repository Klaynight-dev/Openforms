<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { askConfirm } from "$lib/stores/dialog.svelte.ts";
  import { refreshForms } from "$lib/formsCache.ts";
  import { initials, presenceColor } from "$lib/presence.ts";
  import type { FormSummary, Organization, OrganizationMember, OrgRole, OrgViewerRole } from "$lib/types.ts";
  import {
    IconBack,
    IconUsers,
    IconTable,
    IconSettings,
    IconSend,
    IconDuplicate,
    IconTrash,
    IconPlus,
    IconWarning,
    IconEdit,
  } from "$lib/icons.ts";

  const orgId = $derived($page.params.id);

  let organization = $state<Organization | null>(null);
  let myRole = $state<OrgViewerRole | null>(null);
  let members = $state<OrganizationMember[]>([]);
  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  const canManage = $derived(myRole === "OWNER" || myRole === "ADMIN" || myRole === "SUPER_ADMIN");
  const isOwnerLike = $derived(myRole === "OWNER" || myRole === "SUPER_ADMIN");

  const ROLE_LABEL: Record<OrgRole, string> = {
    OWNER: "Propriétaire",
    ADMIN: "Administrateur",
    MEMBER: "Membre",
  };
  const ROLE_HINT: Record<OrgRole, string> = {
    OWNER: "Gère tout, y compris la suppression de l'organisation.",
    ADMIN: "Invite, retire et change le rôle des membres.",
    MEMBER: "Crée et modifie les formulaires de l'organisation.",
  };

  $effect(() => {
    if (orgId) load(orgId);
  });

  async function load(id: string) {
    loading = true;
    loadError = null;
    try {
      const [detail, memberList, formList] = await Promise.all([
        api.getOrganization(id),
        api.listOrgMembers(id),
        refreshForms(),
      ]);
      organization = detail.organization;
      myRole = detail.role;
      members = memberList.members;
      forms = formList;
      nameDraft = detail.organization.name;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Organisation introuvable.";
    } finally {
      loading = false;
    }
  }

  // --- Général ---
  let nameDraft = $state("");
  let renaming = $state(false);

  async function rename(event: Event) {
    event.preventDefault();
    if (!organization || nameDraft.trim().length < 2 || nameDraft.trim() === organization.name) return;
    renaming = true;
    try {
      const res = await api.renameOrganization(organization.id, nameDraft.trim());
      organization = res.organization;
      toasts.success("Organisation renommée.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Renommage impossible.");
    } finally {
      renaming = false;
    }
  }

  // --- Membres ---
  let inviteEmail = $state("");
  let inviteRole = $state<OrgRole>("MEMBER");
  let inviting = $state(false);
  /** Dernier lien d'invitation généré, à transmettre si l'email n'arrive pas. */
  let inviteLink = $state<{ email: string; url: string } | null>(null);
  let copied = $state(false);

  async function invite(event: Event) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!organization || !email) return;
    inviting = true;
    try {
      const res = await api.addOrgMember(organization.id, email, inviteRole);
      members = [...members, res.member];
      inviteEmail = "";
      inviteRole = "MEMBER";
      if (res.inviteLink) {
        inviteLink = { email: res.member.user.email, url: res.inviteLink };
        copied = false;
        toasts.success(`${email} a été ajouté et invité par email.`);
      } else {
        inviteLink = null;
        toasts.success(`${email} a maintenant accès aux formulaires de l'organisation.`);
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Ajout impossible.");
    } finally {
      inviting = false;
    }
  }

  async function resendInvite(member: OrganizationMember) {
    if (!organization) return;
    try {
      const res = await api.resendOrgInvite(organization.id, member.id);
      inviteLink = { email: member.user.email, url: res.inviteLink };
      copied = false;
      toasts.success(`Invitation renvoyée à ${member.user.email}.`);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Renvoi impossible.");
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      toasts.error("Copie impossible : sélectionnez le lien à la main.");
    }
  }

  function canEditRole(member: OrganizationMember): boolean {
    if (!canManage) return false;
    if (member.role === "OWNER" && !isOwnerLike) return false;
    return true;
  }

  async function changeRole(member: OrganizationMember, role: OrgRole) {
    if (!organization || role === member.role) return;
    const previous = member.role;
    member.role = role;
    try {
      const res = await api.updateOrgMember(organization.id, member.id, role);
      members = members.map((m) => (m.id === member.id ? res.member : m));
      if (member.userId === auth.user?.id) myRole = role;
    } catch (e) {
      member.role = previous;
      members = [...members];
      toasts.error(e instanceof Error ? e.message : "Changement de rôle impossible.");
    }
  }

  function canRemove(member: OrganizationMember): boolean {
    if (member.userId === auth.user?.id) return true;
    if (isOwnerLike) return true;
    return myRole === "ADMIN" && member.role !== "OWNER";
  }

  async function removeMember(member: OrganizationMember) {
    if (!organization) return;
    const isSelf = member.userId === auth.user?.id;
    const who = member.user.displayName || member.user.email;
    const ok = await askConfirm({
      title: isSelf ? "Quitter l'organisation ?" : `Retirer ${who} ?`,
      message: isSelf
        ? "Vous perdrez l'accès aux formulaires de l'organisation, sauf ceux qui vous ont été partagés directement."
        : `${who} perdra l'accès aux formulaires de l'organisation, sauf ceux qui lui ont été partagés directement.`,
      confirmLabel: isSelf ? "Quitter" : "Retirer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeOrgMember(organization.id, member.id);
      if (isSelf) {
        toasts.success("Vous avez quitté l'organisation.");
        goto("/admin");
        return;
      }
      members = members.filter((m) => m.id !== member.id);
      toasts.success(`${who} a été retiré.`);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  // --- Formulaires ---
  const orgForms = $derived(forms.filter((f) => f.organizationId === orgId));
  /** Formulaires que l'on peut rattacher : les siens hors de toute organisation. */
  const attachableForms = $derived(
    forms.filter((f) => !f.organizationId && (auth.isSuperAdmin || f.ownerId === auth.user?.id)),
  );
  let formToAttach = $state("");
  let attaching = $state(false);

  async function attachForm(event: Event) {
    event.preventDefault();
    if (!organization || !formToAttach) return;
    attaching = true;
    try {
      await api.moveFormToOrganization(formToAttach, organization.id);
      forms = forms.map((f) => (f.id === formToAttach ? { ...f, organizationId: orgId } : f));
      formToAttach = "";
      toasts.success("Formulaire ajouté : tous les membres y ont désormais accès.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Déplacement impossible.");
    } finally {
      attaching = false;
    }
  }

  function canDetach(form: FormSummary): boolean {
    return auth.isSuperAdmin || form.ownerId === auth.user?.id;
  }

  async function detachForm(form: FormSummary) {
    const ok = await askConfirm({
      title: `Retirer « ${form.title} » de l'organisation ?`,
      message: "Le formulaire revient dans votre espace personnel. Les membres n'y auront plus accès, sauf partage direct.",
      confirmLabel: "Retirer",
    });
    if (!ok) return;
    try {
      await api.moveFormToOrganization(form.id, null);
      forms = forms.map((f) => (f.id === form.id ? { ...f, organizationId: null } : f));
      toasts.success("Formulaire retiré de l'organisation.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  // --- Suppression ---
  async function deleteOrganization() {
    if (!organization) return;
    const ok = await askConfirm({
      title: `Supprimer « ${organization.name} » ?`,
      message: "Les membres perdront leur accès. Les formulaires et leurs réponses sont conservés : chacun revient dans l'espace personnel de son propriétaire.",
      confirmLabel: "Supprimer l'organisation",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteOrganization(organization.id);
      toasts.success("Organisation supprimée.");
      goto("/admin");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }
</script>

<svelte:head><title>{organization ? `${organization.name} · Paramètres` : "Organisation"}</title></svelte:head>

<div class="mx-auto max-w-3xl">
  <a href="/admin" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)]">
    <IconBack size={16} /> Formulaires
  </a>

  {#if loading}
    <div class="space-y-4 animate-pulse">
      <div class="h-8 w-1/2 rounded-md bg-slate-200"></div>
      <div class="card h-40 bg-slate-50"></div>
      <div class="card h-64 bg-slate-50"></div>
    </div>
  {:else if loadError || !organization}
    <div class="card text-sm text-[color:var(--danger)]">{loadError ?? "Organisation introuvable."}</div>
  {:else}
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-[color:var(--ink)]">{organization.name}</h1>
      <p class="mt-1 text-sm text-[color:var(--muted)]">
        Paramètres de l'organisation · votre rôle :
        <strong class="text-[color:var(--ink)]">{myRole === "SUPER_ADMIN" ? "Super Admin" : ROLE_LABEL[myRole as OrgRole]}</strong>
      </p>
    </header>

    <div class="space-y-6">
      <!-- Général -->
      {#if canManage}
        <section class="card">
          <h2 class="mb-3 flex items-center gap-2 font-bold"><IconSettings size={18} /> Général</h2>
          <form class="flex flex-col gap-2 sm:flex-row" onsubmit={rename}>
            <label class="sr-only" for="org-name">Nom de l'organisation</label>
            <input id="org-name" class="input flex-1" bind:value={nameDraft} minlength="2" maxlength="100" required />
            <button
              class="btn-secondary shrink-0"
              type="submit"
              disabled={renaming || nameDraft.trim().length < 2 || nameDraft.trim() === organization.name}
            >
              <IconEdit size={16} /> {renaming ? "Enregistrement…" : "Renommer"}
            </button>
          </form>
        </section>
      {/if}

      <!-- Membres -->
      <section class="card">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="flex items-center gap-2 font-bold"><IconUsers size={18} /> Membres <span class="text-sm font-semibold text-[color:var(--muted)]">({members.length})</span></h2>
        </div>
        <p class="mb-4 text-xs text-[color:var(--muted)]">
          Chaque membre peut ouvrir et modifier tous les formulaires de l'organisation. Le rôle ne décide que de qui gère l'équipe.
        </p>

        {#if canManage}
          <form class="mb-4 rounded-xl bg-slate-50 p-4" onsubmit={invite}>
            <label class="mb-2 block text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]" for="invite-email">Ajouter une personne</label>
            <div class="flex flex-col gap-2 sm:flex-row">
              <input
                id="invite-email"
                type="email"
                class="input flex-1"
                placeholder="prenom.nom@exemple.fr"
                autocomplete="off"
                bind:value={inviteEmail}
                required
              />
              <select class="input sm:w-44" bind:value={inviteRole} aria-label="Rôle">
                <option value="MEMBER">Membre</option>
                <option value="ADMIN">Administrateur</option>
                {#if isOwnerLike}<option value="OWNER">Propriétaire</option>{/if}
              </select>
              <button class="btn-primary shrink-0" type="submit" disabled={inviting || !inviteEmail.trim()}>
                <IconPlus size={16} weight="bold" /> {inviting ? "Ajout…" : "Ajouter"}
              </button>
            </div>
            <p class="mt-2 text-xs text-[color:var(--muted)]">{ROLE_HINT[inviteRole]} Sans compte, la personne reçoit un email pour choisir son mot de passe.</p>
          </form>
        {/if}

        {#if inviteLink}
          <div class="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-700">
              <IconSend size={15} /> Lien d'activation pour {inviteLink.email}
            </p>
            <p class="mb-2 text-xs text-[color:var(--muted)]">Envoyé par email. S'il n'arrive pas, transmettez ce lien vous-même (valable 48 h).</p>
            <div class="flex items-center gap-2">
              <input class="input flex-1 text-xs" readonly value={inviteLink.url} onfocus={(e) => (e.target as HTMLInputElement).select()} />
              <button type="button" class="btn-secondary shrink-0 text-xs" onclick={copyInviteLink}>
                <IconDuplicate size={14} /> {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </div>
        {/if}

        <ul class="divide-y divide-[color:var(--line)]">
          {#each members as member (member.id)}
            {@const name = member.user.displayName || member.user.email}
            {@const isSelf = member.userId === auth.user?.id}
            <li class="flex flex-wrap items-center gap-3 py-3">
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style="background:{presenceColor(member.userId)}"
                aria-hidden="true"
              >
                {initials(name)}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-[color:var(--ink)]">
                  {name}{#if isSelf}<span class="font-normal text-[color:var(--muted)]"> (vous)</span>{/if}
                </p>
                <p class="flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--muted)]">
                  {#if member.user.displayName}<span class="truncate">{member.user.email}</span>{/if}
                  {#if member.user.hasPassword === false}
                    <span class="font-semibold text-amber-700">Invitation en attente</span>
                    {#if canManage}
                      <button class="font-semibold text-brand-700 hover:underline" onclick={() => resendInvite(member)}>Renvoyer</button>
                    {/if}
                  {/if}
                </p>
              </div>
              <div class="flex items-center gap-2">
                {#if canEditRole(member)}
                  <select
                    class="input !w-40 !py-1.5 text-xs"
                    value={member.role}
                    aria-label="Rôle de {name}"
                    onchange={(e) => changeRole(member, (e.target as HTMLSelectElement).value as OrgRole)}
                  >
                    <option value="MEMBER">Membre</option>
                    <option value="ADMIN">Administrateur</option>
                    {#if isOwnerLike}<option value="OWNER">Propriétaire</option>{/if}
                  </select>
                {:else}
                  <span class="chip-muted">{ROLE_LABEL[member.role]}</span>
                {/if}
                {#if canRemove(member)}
                  <button
                    class="btn-text !p-2 text-[color:var(--muted)] hover:!text-[color:var(--danger)]"
                    onclick={() => removeMember(member)}
                    title={isSelf ? "Quitter l'organisation" : `Retirer ${name}`}
                    aria-label={isSelf ? "Quitter l'organisation" : `Retirer ${name}`}
                  >
                    <IconTrash size={16} />
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>

      <!-- Formulaires -->
      <section class="card">
        <h2 class="mb-1 flex items-center gap-2 font-bold"><IconTable size={18} /> Formulaires <span class="text-sm font-semibold text-[color:var(--muted)]">({orgForms.length})</span></h2>
        <p class="mb-4 text-xs text-[color:var(--muted)]">Tous les membres ont accès à ces formulaires et à leurs réponses.</p>

        {#if orgForms.length === 0}
          <p class="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-[color:var(--muted)]">
            Aucun formulaire pour l'instant. Créez-en un depuis l'espace de l'organisation ou ajoutez-en un existant ci-dessous.
          </p>
        {:else}
          <ul class="mb-4 divide-y divide-[color:var(--line)]">
            {#each orgForms as form (form.id)}
              <li class="flex items-center gap-3 py-2.5">
                <a href={`/admin/forms/${form.id}`} class="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--ink)] hover:text-brand-700">
                  {form.title}
                </a>
                <span class="shrink-0 text-xs text-[color:var(--muted)]">{form._count?.responses ?? 0} réponse(s)</span>
                {#if canDetach(form)}
                  <button class="btn-text !px-2 !py-1 text-xs text-[color:var(--muted)]" onclick={() => detachForm(form)}>Retirer</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if attachableForms.length > 0}
          <form class="flex flex-col gap-2 sm:flex-row" onsubmit={attachForm}>
            <label class="sr-only" for="attach-form">Formulaire à ajouter</label>
            <select id="attach-form" class="input flex-1" bind:value={formToAttach}>
              <option value="">Ajouter un de vos formulaires…</option>
              {#each attachableForms as form (form.id)}
                <option value={form.id}>{form.title}</option>
              {/each}
            </select>
            <button class="btn-secondary shrink-0" type="submit" disabled={!formToAttach || attaching}>
              <IconPlus size={16} /> {attaching ? "Ajout…" : "Ajouter"}
            </button>
          </form>
        {/if}
      </section>

      <!-- Zone sensible -->
      {#if isOwnerLike}
        <section class="card border border-red-100">
          <h2 class="mb-1 flex items-center gap-2 font-bold text-[color:var(--danger)]"><IconWarning size={18} /> Supprimer l'organisation</h2>
          <p class="mb-3 text-xs text-[color:var(--muted)]">Les formulaires ne sont pas supprimés : chacun revient à son propriétaire.</p>
          <button class="btn-danger" onclick={deleteOrganization}><IconTrash size={16} /> Supprimer</button>
        </section>
      {/if}
    </div>
  {/if}
</div>
