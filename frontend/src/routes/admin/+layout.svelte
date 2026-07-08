<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { IconLeaf, IconUsers, IconLogout, IconTable, IconClose, IconChartBar } from "$lib/icons.ts";

  let { children } = $props();
  let menuOpen = $state(false);

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
  <div class="min-h-screen overflow-x-hidden bg-[#f8f9fa]">
    {#if showChrome}
      <header class="sticky top-0 z-20 border-b border-[color:var(--line)] bg-white/85 backdrop-blur-md">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <a href="/admin" class="flex items-center gap-2.5 font-bold text-[color:var(--ink)] text-lg min-w-0 shrink-0">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20 shrink-0">
              <IconLeaf size={20} weight="fill" />
            </span>
            <span class="hidden sm:inline truncate">Humanitour</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 shrink-0">admin</span>
          </a>
          <nav class="hidden md:flex items-center gap-1.5 text-sm font-semibold">
            <a href="/admin" class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[color:var(--muted)] hover:bg-brand-50 hover:text-brand-700 transition">
              <IconTable size={18} /> Formulaires
            </a>
            {#if auth.isSuperAdmin}
              <a href="/admin/users" class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[color:var(--muted)] hover:bg-brand-50 hover:text-brand-700 transition">
                <IconUsers size={18} /> Utilisateurs
              </a>
            {/if}
            <span class="mx-2 text-xs font-semibold text-[color:var(--muted)] bg-slate-100 rounded-lg px-2.5 py-1.5">{auth.user?.email}</span>
            <span class="chip-muted">{auth.user?.role === "SUPER_ADMIN" ? "Super Admin" : "Éditeur"}</span>
            <button class="btn-text !py-2 hover:!text-[color:var(--danger)]" onclick={logout} title="Déconnexion">
              <IconLogout size={18} /> Déconnexion
            </button>
          </nav>
          
          <!-- Hamburger menu mobile -->
          <button 
            class="flex md:hidden h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:bg-slate-50 active:scale-95 transition"
            onclick={() => menuOpen = true}
            aria-label="Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Drawer mobile -->
      {#if menuOpen}
        <div class="mobile-nav-overlay" onclick={() => menuOpen = false} role="none"></div>
        <div class="mobile-nav-drawer" class:collapsed={!menuOpen}>
          <div class="flex items-center justify-between mb-5">
            <span class="font-bold text-lg text-[color:var(--ink)]">Menu Humanitour</span>
            <button 
              class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[color:var(--muted)] hover:text-[color:var(--ink)]" 
              onclick={() => menuOpen = false}
            >
              <IconClose size={20} />
            </button>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-1">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold">
                {auth.user?.email?.[0].toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate text-[color:var(--ink)]">{auth.user?.email}</p>
                <p class="text-xs text-[color:var(--muted)]">{auth.user?.role === "SUPER_ADMIN" ? "Super Admin" : "Éditeur"}</p>
              </div>
            </div>

            <a 
              href="/admin" 
              class="flex items-center gap-3 rounded-xl p-3.5 text-sm font-semibold text-[color:var(--ink)] hover:bg-brand-50 hover:text-brand-700 transition"
              onclick={() => menuOpen = false}
            >
              <IconTable size={20} /> Formulaires
            </a>
            {#if auth.isSuperAdmin}
              <a 
                href="/admin/users" 
                class="flex items-center gap-3 rounded-xl p-3.5 text-sm font-semibold text-[color:var(--ink)] hover:bg-brand-50 hover:text-brand-700 transition"
                onclick={() => menuOpen = false}
              >
                <IconUsers size={20} /> Utilisateurs
              </a>
            {/if}
            <hr class="border-[color:var(--line)]" />
            <button 
              class="flex items-center gap-3 rounded-xl p-3.5 text-sm font-semibold text-[color:var(--danger)] hover:bg-red-50 transition w-full text-left"
              onclick={() => { menuOpen = false; logout(); }}
            >
              <IconLogout size={20} /> Déconnexion
            </button>
          </div>
        </div>
      {/if}
    {/if}
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      {@render children()}
    </div>
  </div>
{/if}
