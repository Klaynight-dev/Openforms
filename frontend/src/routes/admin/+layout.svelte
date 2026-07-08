<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { IconLeaf, IconUsers, IconLogout, IconTable } from "$lib/icons.ts";

  let { children } = $props();

  onMount(() => {
    if (!auth.ready) auth.refresh();
  });

  $effect(() => {
    if (!auth.ready) return;
    const isLogin = $page.url.pathname === "/admin/login";
    if (!auth.isAuthenticated && !isLogin) goto("/admin/login");
    if (auth.isAuthenticated && isLogin) goto("/admin");
  });

  async function logout() {
    await auth.logout();
    goto("/admin/login");
  }

  let showChrome = $derived(auth.isAuthenticated && $page.url.pathname !== "/admin/login");
</script>

{#if !auth.ready}
  <div class="grid h-screen place-items-center text-[color:var(--muted)]">Chargement…</div>
{:else}
  <div class="min-h-screen bg-[#f8f9fa]">
    {#if showChrome}
      <header class="sticky top-0 z-20 border-b border-[color:var(--line)] bg-white">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
          <a href="/admin" class="flex items-center gap-2 font-semibold text-[color:var(--ink)]">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <IconLeaf size={18} weight="fill" />
            </span>
            Humanitour <span class="text-xs font-normal text-[color:var(--muted)]">admin</span>
          </a>
          <nav class="flex items-center gap-1.5 text-sm">
            <a href="/admin" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[color:var(--muted)] hover:bg-brand-50 hover:text-brand-700">
              <IconTable size={17} /> Formulaires
            </a>
            {#if auth.isSuperAdmin}
              <a href="/admin/users" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[color:var(--muted)] hover:bg-brand-50 hover:text-brand-700">
                <IconUsers size={17} /> Utilisateurs
              </a>
            {/if}
            <span class="mx-2 hidden text-[color:var(--muted)] sm:inline">{auth.user?.email}</span>
            <span class="chip-muted">{auth.user?.role === "SUPER_ADMIN" ? "Super Admin" : "Éditeur"}</span>
            <button class="btn-text !py-1.5" onclick={logout} title="Déconnexion">
              <IconLogout size={17} /> Déconnexion
            </button>
          </nav>
        </div>
      </header>
    {/if}
    <div class="mx-auto max-w-7xl px-6 py-6">
      {@render children()}
    </div>
  </div>
{/if}
