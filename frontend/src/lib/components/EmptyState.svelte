<script lang="ts">
  /**
   * État vide unifié : une icône, une phrase qui explique *pourquoi* c'est vide,
   * et si possible l'action qui remplit l'écran.
   */
  import type { Component, Snippet } from "svelte";
  import { IconEmpty } from "$lib/icons.ts";

  interface Props {
    title: string;
    hint?: string;
    icon?: Component<{ size?: number; weight?: string }>;
    /** Boutons d'action. */
    children?: Snippet;
    compact?: boolean;
  }

  let { title, hint, icon, children, compact = false }: Props = $props();
  const Icon = $derived(icon ?? IconEmpty);
</script>

<div class="empty" class:compact>
  <span class="badge"><Icon size={compact ? 20 : 26} /></span>
  <p class="title">{title}</p>
  {#if hint}<p class="hint">{hint}</p>{/if}
  {#if children}
    <div class="actions">{@render children()}</div>
  {/if}
</div>

<style lang="scss">
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.375rem;
    padding: 2.5rem 1.25rem;
  }
  .empty.compact {
    padding: 1.5rem 1rem;
  }

  .badge {
    display: grid;
    place-items: center;
    height: 3rem;
    width: 3rem;
    margin-bottom: 0.375rem;
    border-radius: 999px;
    background: #f1f5f9;
    color: #94a3b8;
  }
  .compact .badge {
    height: 2.25rem;
    width: 2.25rem;
  }

  .title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--ink);
  }
  .compact .title {
    font-size: 0.8125rem;
  }

  .hint {
    max-width: 30rem;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.5;
  }
  .compact .hint {
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 0.75rem;
  }
</style>
