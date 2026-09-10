<script lang="ts">
  /**
   * Pile de notifications, montée une fois dans le layout racine.
   * `aria-live="polite"` : annoncé sans interrompre le lecteur d'écran.
   */
  import { fly } from "svelte/transition";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { IconCheckCircle, IconClose, IconInfo, IconWarning } from "$lib/icons.ts";

  const ICONS = { success: IconCheckCircle, error: IconWarning, info: IconInfo };
</script>

<div class="toast-host" aria-live="polite" aria-atomic="false">
  {#each toasts.items as toast (toast.id)}
    {@const Icon = ICONS[toast.kind]}
    <div class="toast toast-{toast.kind}" transition:fly={{ y: 12, duration: 180 }} role="status">
      <Icon size={18} weight="fill" />
      <span class="toast-msg">{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          class="toast-action"
          onclick={() => {
            toast.action?.run();
            toasts.dismiss(toast.id);
          }}>{toast.action.label}</button
        >
      {/if}
      <button
        type="button"
        class="toast-close"
        aria-label="Fermer la notification"
        onclick={() => toasts.dismiss(toast.id)}
      >
        <IconClose size={14} />
      </button>
    </div>
  {/each}
</div>

<style lang="scss">
  .toast-host {
    position: fixed;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    pointer-events: none;
    width: min(32rem, calc(100vw - 2rem));
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem 0.75rem 0.75rem 1rem;
    border-radius: 0.875rem;
    border: 1px solid;
    background: #fff;
    color: var(--ink);
    font-size: 0.875rem;
    box-shadow:
      0 10px 25px -5px rgba(15, 23, 42, 0.15),
      0 8px 10px -6px rgba(15, 23, 42, 0.1);
  }

  .toast-msg {
    flex: 1;
    min-width: 0;
  }

  .toast-success {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #14532d;
  }
  .toast-error {
    border-color: #fecaca;
    background: #fef2f2;
    color: #7f1d1d;
  }
  .toast-info {
    border-color: var(--brand-100);
    background: var(--brand-50);
    color: var(--brand-700);
  }

  .toast-action {
    flex-shrink: 0;
    font-weight: 600;
    font-size: 0.8125rem;
    text-decoration: underline;
    text-underline-offset: 2px;
    padding: 0.125rem 0.25rem;
    border-radius: 0.375rem;
  }
  .toast-action:hover {
    background: rgba(15, 23, 42, 0.06);
  }

  .toast-close {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    height: 1.5rem;
    width: 1.5rem;
    border-radius: 999px;
    opacity: 0.55;
  }
  .toast-close:hover {
    opacity: 1;
    background: rgba(15, 23, 42, 0.08);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      transition: none;
    }
  }
</style>
