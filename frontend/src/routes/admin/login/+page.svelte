<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { IconLeaf, IconLock } from "$lib/icons.ts";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = null;
    loading = true;
    try {
      await auth.login(email, password);
      goto("/admin");
    } catch (err: any) {
      error = err?.message ?? "Connexion impossible.";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Connexion — Admin</title></svelte:head>

<div class="grid min-h-[80vh] place-items-center">
  <form onsubmit={submit} class="gform-card w-full max-w-sm p-8">
    <div class="mb-6 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white">
        <IconLeaf size={26} weight="fill" />
      </div>
      <h1 class="text-xl font-bold">Espace administration</h1>
      <p class="mt-1 text-sm text-[color:var(--muted)]">Connectez-vous pour continuer</p>
    </div>
    <label class="label" for="email">Email</label>
    <input id="email" class="input mb-3" type="email" bind:value={email} required autocomplete="username" />
    <label class="label" for="pw">Mot de passe</label>
    <input id="pw" class="input mb-4" type="password" bind:value={password} required autocomplete="current-password" />
    {#if error}
      <p class="mb-3 flex items-center gap-1.5 text-sm text-[color:var(--danger)]">
        <IconLock size={15} /> {error}
      </p>
    {/if}
    <button class="btn-primary w-full" type="submit" disabled={loading}>
      {loading ? "Connexion…" : "Se connecter"}
    </button>
  </form>
</div>
