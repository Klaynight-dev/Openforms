<script lang="ts">
  /**
   * Pied de page légal : obligatoire sur les pages accessibles au public
   * (art. 6-III LCEN). Monté sur l'accueil, les formulaires publics et
   * l'espace d'administration.
   */
  import { LEGAL, LEGAL_PAGES } from "$lib/legal.ts";

  let { compact = false }: { compact?: boolean } = $props();
</script>

<footer
  class="mt-12 border-t border-[color:var(--line)] pb-10 pt-5 text-center text-xs text-[color:var(--muted)]"
  class:mt-6={compact}
>
  <nav aria-label="Informations légales" class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5">
    {#each LEGAL_PAGES as item, i (item.href)}
      {#if i > 0}<span aria-hidden="true" class="opacity-40">·</span>{/if}
      <a href={item.href} class="rounded px-1.5 py-0.5 hover:text-[color:var(--brand)] hover:underline">
        {item.short}
      </a>
    {/each}
  </nav>
  <p class="mt-2">© {new Date().getFullYear()} {LEGAL.publisher.legalName}. Service open-source, sans tracker.</p>
</footer>
