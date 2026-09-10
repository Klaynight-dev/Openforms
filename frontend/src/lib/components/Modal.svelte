<script lang="ts">
  /**
   * Boîte de dialogue modale accessible.
   *
   * - fermeture par Échap, clic sur le fond, ou bouton ×
   * - focus déplacé dans la modale à l'ouverture et rendu à l'élément d'origine
   *   à la fermeture, cycle de tabulation piégé à l'intérieur
   * - le défilement de la page est gelé pendant l'ouverture
   */
  import { fade, scale } from "svelte/transition";
  import type { Snippet } from "svelte";
  import { IconClose } from "$lib/icons.ts";

  interface Props {
    open: boolean;
    title: string;
    /** Ligne d'explication sous le titre. */
    description?: string;
    size?: "sm" | "md" | "lg" | "xl";
    /** Empêche la fermeture par Échap / clic extérieur (opération en cours). */
    dismissible?: boolean;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let {
    open,
    title,
    description,
    size = "md",
    dismissible = true,
    onclose,
    children,
    footer,
  }: Props = $props();

  let dialogEl = $state<HTMLDivElement>();
  let restoreFocusTo: HTMLElement | null = null;

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  $effect(() => {
    if (!open) return;

    restoreFocusTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Le nœud n'est monté qu'au tick suivant l'ouverture.
    const focusTimer = setTimeout(() => {
      const first = dialogEl?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialogEl)?.focus();
    }, 0);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo?.focus?.();
    };
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && dismissible) {
      event.stopPropagation();
      onclose();
      return;
    }
    if (event.key !== "Tab" || !dialogEl) return;

    const targets = [...dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (targets.length === 0) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <!-- Le fond n'est qu'un décor : les interactions clavier vivent sur le dialogue. -->
  <div
    class="backdrop"
    transition:fade={{ duration: 140 }}
    onclick={() => dismissible && onclose()}
    aria-hidden="true"
  ></div>

  <div class="wrap" onkeydown={onKeydown} role="presentation">
    <div
      class="dialog size-{size}"
      bind:this={dialogEl}
      transition:scale={{ duration: 160, start: 0.97 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-desc" : undefined}
      tabindex="-1"
    >
      <header>
        <div class="min-w-0">
          <h2 id="modal-title">{title}</h2>
          {#if description}
            <p id="modal-desc">{description}</p>
          {/if}
        </div>
        <button type="button" class="close" onclick={onclose} aria-label="Fermer">
          <IconClose size={18} />
        </button>
      </header>

      <div class="body">
        {@render children()}
      </div>

      {#if footer}
        <footer>
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
  }

  .wrap {
    position: fixed;
    inset: 0;
    z-index: 101;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    pointer-events: none;
  }

  .dialog {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: calc(100vh - 2rem);
    background: #fff;
    border-radius: 1.25rem;
    border: 1px solid var(--line);
    box-shadow:
      0 25px 50px -12px rgba(15, 23, 42, 0.25),
      0 10px 20px -10px rgba(15, 23, 42, 0.15);
    outline: none;
  }

  .size-sm {
    max-width: 24rem;
  }
  .size-md {
    max-width: 34rem;
  }
  .size-lg {
    max-width: 48rem;
  }
  .size-xl {
    max-width: 68rem;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.25rem 0.875rem;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.3;
  }

  header p {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.45;
  }

  .close {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    height: 2rem;
    width: 2rem;
    border-radius: 999px;
    color: var(--muted);
  }
  .close:hover {
    background: #f1f5f9;
    color: var(--ink);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.875rem 1.25rem;
    border-top: 1px solid var(--line);
    background: #fbfcfe;
    border-radius: 0 0 1.25rem 1.25rem;
  }
</style>
