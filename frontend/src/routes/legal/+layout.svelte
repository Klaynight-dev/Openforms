<script lang="ts">
  import { page } from "$app/stores";
  import { LEGAL, LEGAL_PAGES } from "$lib/legal.ts";
  import { IconBack, IconLeaf } from "$lib/icons.ts";

  let { children } = $props();
  let current = $derived($page.url.pathname);
</script>

<div class="min-h-screen bg-[color:var(--surface-bg)]">
  <header class="border-b border-[color:var(--line)] bg-white/85 backdrop-blur-md">
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
      <a href="/" class="flex items-center gap-2.5 font-semibold text-[color:var(--ink)]">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
          <IconLeaf size={20} weight="fill" />
        </span>
        <span class="truncate">{LEGAL.siteName}</span>
      </a>
      <a href="/" class="btn-text gap-1.5 text-sm"><IconBack size={16} /> Retour à l'accueil</a>
    </div>
  </header>

  <div class="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[240px_1fr]">
    <!-- Sommaire : navigation entre les quatre textes légaux. -->
    <nav aria-label="Informations légales" class="lg:sticky lg:top-8 lg:self-start">
      <p class="section-label">Informations légales</p>
      <ul class="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {#each LEGAL_PAGES as item (item.href)}
          <li>
            <a
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
              class="block rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              class:bg-brand-50={current === item.href}
              class:text-brand-700={current === item.href}
              class:text-slate-600={current !== item.href}
              class:hover:bg-white={current !== item.href}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <main class="legal-prose card !p-8">
      {@render children()}
      <p class="mt-10 border-t border-[color:var(--line)] pt-4 text-xs text-[color:var(--muted)]">
        Dernière mise à jour : {LEGAL.lastUpdated}.
      </p>
    </main>
  </div>
</div>

<style>
  /* Typographie des textes légaux : le projet n'embarque pas le plugin
     `@tailwindcss/typography`, ces règles jouent le même rôle en local. */
  .legal-prose :global(h1) {
    font-size: 1.875rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .legal-prose :global(h1 + p) {
    margin-top: 0.5rem;
    color: var(--muted);
  }
  .legal-prose :global(h2) {
    margin-top: 2.25rem;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--ink);
  }
  .legal-prose :global(h3) {
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--ink);
  }
  .legal-prose :global(p),
  .legal-prose :global(li) {
    font-size: 0.9375rem;
    line-height: 1.7;
    color: var(--ink-soft);
  }
  .legal-prose :global(p) {
    margin-bottom: 0.75rem;
  }
  .legal-prose :global(ul) {
    margin-bottom: 0.75rem;
    padding-left: 1.1rem;
    list-style: disc;
  }
  .legal-prose :global(ol) {
    margin-bottom: 0.75rem;
    padding-left: 1.25rem;
    list-style: decimal;
  }
  .legal-prose :global(li) {
    margin-bottom: 0.25rem;
  }
  .legal-prose :global(a) {
    color: var(--brand);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .legal-prose :global(strong) {
    color: var(--ink);
    font-weight: 600;
  }
  .legal-prose :global(table) {
    width: 100%;
    margin-bottom: 1rem;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .legal-prose :global(th),
  .legal-prose :global(td) {
    border: 1px solid var(--line);
    padding: 0.5rem 0.75rem;
    text-align: left;
    vertical-align: top;
    color: var(--ink-soft);
  }
  .legal-prose :global(th) {
    background: var(--surface-alt);
    font-weight: 600;
    color: var(--ink);
  }
  .legal-prose :global(code) {
    background: var(--surface-alt);
    border: 1px solid var(--line);
    border-radius: 0.375rem;
    padding: 0.05rem 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    color: var(--ink);
  }
  .legal-prose :global(.note) {
    border-left: 3px solid var(--brand);
    background: var(--brand-50);
    border-radius: 0 0.75rem 0.75rem 0;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
  }
</style>
