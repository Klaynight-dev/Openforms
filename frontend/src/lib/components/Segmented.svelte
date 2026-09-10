<script lang="ts" generics="T extends string | number">
  /**
   * Sélecteur segmenté : remplace un `<select>` ou une paire de boutons quand
   * les options sont peu nombreuses et gagnent à rester toutes visibles.
   * Navigable aux flèches, conformément au motif ARIA « radiogroup ».
   */
  interface Props {
    value: T;
    options: { value: T; label: string; title?: string }[];
    label: string;
    /** Compact : barres d'outils de cartes. */
    dense?: boolean;
    onchange: (value: T) => void;
  }

  let { value, options, label, dense = false, onchange }: Props = $props();

  function onKeydown(event: KeyboardEvent) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + delta + options.length) % options.length];
    onchange(next.value);
  }
</script>

<!-- tabindex sur le conteneur : la tabulation entre dans le groupe puis les
     flèches naviguent (tabindex mobile porté par les boutons). -->
<div
  class="segmented"
  class:dense
  role="radiogroup"
  tabindex="-1"
  aria-label={label}
  onkeydown={onKeydown}
>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      tabindex={option.value === value ? 0 : -1}
      title={option.title ?? option.label}
      class:active={option.value === value}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style lang="scss">
  .segmented {
    display: inline-flex;
    padding: 0.1875rem;
    gap: 0.125rem;
    background: #f1f5f9;
    border-radius: 0.75rem;
  }

  button {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--muted);
    border-radius: 0.625rem;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s;
  }

  button:hover:not(.active) {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.6);
  }

  button.active {
    background: #fff;
    color: var(--brand);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .dense button {
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
  }
</style>
