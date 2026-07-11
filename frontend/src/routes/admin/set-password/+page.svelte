<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { IconLeaf, IconLock } from "$lib/icons.ts";

  let token = $state("");
  let checking = $state(true);
  let valid = $state(false);
  let invitedEmail = $state<string | null>(null);

  let password = $state("");
  let confirmPassword = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

  onMount(async () => {
    token = $page.url.searchParams.get("token") ?? "";
    if (!token) {
      checking = false;
      valid = false;
      return;
    }
    try {
      const res = await api.verifyInvite(token);
      valid = res.valid;
      invitedEmail = res.email ?? null;
    } catch {
      valid = false;
    } finally {
      checking = false;
    }
  });

  async function submit(e: Event) {
    e.preventDefault();
    error = null;

    if (password.length < 10) {
      error = "Le mot de passe doit faire au moins 10 caractères.";
      return;
    }
    if (password !== confirmPassword) {
      error = "Les mots de passe ne correspondent pas.";
      return;
    }

    loading = true;
    try {
      await auth.acceptInvite(token, password);
      goto("/admin");
    } catch (err: any) {
      error = err?.message ?? "Impossible de définir le mot de passe.";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Définir mon mot de passe — Admin</title></svelte:head>

<div class="grid min-h-[85vh] place-items-center py-8">
  <div class="gform-card w-full max-w-md p-8">
    <div class="mb-6 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
        <IconLeaf size={26} weight="fill" />
      </div>
      <h1 class="text-xl font-bold">Définir mon mot de passe</h1>
      {#if invitedEmail}
        <p class="mt-1 text-sm text-[color:var(--muted)]">Compte : {invitedEmail}</p>
      {/if}
    </div>

    {#if checking}
      <p class="text-center text-sm text-[color:var(--muted)]">Vérification du lien…</p>
    {:else if !valid}
      <p class="flex items-center gap-1.5 text-sm text-[color:var(--danger)] bg-red-50 p-3 rounded-lg border border-red-100">
        <IconLock size={15} class="shrink-0" /> Ce lien d'invitation est invalide ou a expiré. Demandez à un administrateur de vous en renvoyer un.
      </p>
    {:else}
      <form onsubmit={submit}>
        <label class="label" for="pw">Mot de passe (10+ caract.)</label>
        <input id="pw" class="input mb-3" type="password" bind:value={password} required minlength="10" placeholder="••••••••••••" autocomplete="new-password" />

        <label class="label" for="pwConfirm">Confirmer le mot de passe</label>
        <input id="pwConfirm" class="input mb-4" type="password" bind:value={confirmPassword} required minlength="10" placeholder="••••••••••••" autocomplete="new-password" />

        {#if error}
          <p class="mb-4 flex items-center gap-1.5 text-sm text-[color:var(--danger)] bg-red-50 p-3 rounded-lg border border-red-100">
            <IconLock size={15} class="shrink-0" /> <span class="font-semibold">{error}</span>
          </p>
        {/if}

        <button class="btn-primary w-full py-2.5 font-bold" type="submit" disabled={loading}>
          {loading ? "Création…" : "Définir mon mot de passe"}
        </button>
      </form>
    {/if}
  </div>
</div>
