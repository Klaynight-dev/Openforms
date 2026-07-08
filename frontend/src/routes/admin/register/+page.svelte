<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { IconLeaf, IconLock, IconUser, IconClose } from "$lib/icons.ts";

  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

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
      await auth.register(email, password, displayName || undefined);
      goto("/admin");
    } catch (err: any) {
      error = err?.message ?? "Inscription impossible.";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Inscription — Admin</title></svelte:head>

<div class="grid min-h-[85vh] place-items-center py-8">
  <form onsubmit={submit} class="gform-card w-full max-w-md p-8">
    <div class="mb-6 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
        <IconLeaf size={26} weight="fill" />
      </div>
      <h1 class="text-xl font-bold">Créer un compte</h1>
      <p class="mt-1 text-sm text-[color:var(--muted)]">Rejoignez Humanitours et commencez à concevoir vos formulaires</p>
    </div>

    <label class="label animate-fade-in" for="displayName">Nom d'affichage (Optionnel)</label>
    <input id="displayName" class="input mb-3" type="text" bind:value={displayName} placeholder="Ex: Jean Dupont" autocomplete="name" />

    <label class="label" for="email">Adresse e-mail</label>
    <input id="email" class="input mb-3" type="email" bind:value={email} required placeholder="nom@exemple.com" autocomplete="email" />

    <label class="label" for="pw">Mot de passe (10+ caract.)</label>
    <input id="pw" class="input mb-3" type="password" bind:value={password} required minlength="10" placeholder="••••••••••••" autocomplete="new-password" />

    <label class="label" for="pwConfirm">Confirmer le mot de passe</label>
    <input id="pwConfirm" class="input mb-4" type="password" bind:value={confirmPassword} required minlength="10" placeholder="••••••••••••" autocomplete="new-password" />

    {#if error}
      <p class="mb-4 flex items-center gap-1.5 text-sm text-[color:var(--danger)] bg-red-50 p-3 rounded-lg border border-red-100">
        <IconLock size={15} class="shrink-0" /> <span class="font-semibold">{error}</span>
      </p>
    {/if}

    <button class="btn-primary w-full py-2.5 font-bold mb-4" type="submit" disabled={loading}>
      {loading ? "Création du compte…" : "S'inscrire et commencer"}
    </button>

    <div class="text-center text-xs">
      <span class="text-[color:var(--muted)]">Déjà membre ?</span>
      <a href="/admin/login" class="text-brand-500 font-bold hover:underline ml-1">Se connecter</a>
    </div>
  </form>
</div>
