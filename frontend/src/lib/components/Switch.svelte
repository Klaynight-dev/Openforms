<script lang="ts">
  /**
   * Interrupteur pour un réglage qui s'applique immédiatement (pas de
   * validation). Une case à cocher reste préférable dans un formulaire soumis.
   */
  interface Props {
    checked: boolean;
    label: string;
    /** Précision affichée sous le libellé. */
    hint?: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  }

  let { checked, label, hint, disabled = false, onchange }: Props = $props();
</script>

<label class="switch" class:disabled>
  <input
    type="checkbox"
    {checked}
    {disabled}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
  <span class="text">
    <span class="lbl">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
</label>

<style lang="scss">
  .switch {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    user-select: none;
  }
  .switch.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .track {
    flex-shrink: 0;
    position: relative;
    width: 2.25rem;
    height: 1.25rem;
    margin-top: 0.0625rem;
    border-radius: 999px;
    background: #cbd5e1;
    transition: background 0.18s;
  }

  .knob {
    position: absolute;
    top: 0.1875rem;
    left: 0.1875rem;
    height: 0.875rem;
    width: 0.875rem;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
    transition: transform 0.18s;
  }

  input:checked + .track {
    background: var(--brand);
  }
  input:checked + .track .knob {
    transform: translateX(1rem);
  }
  input:focus-visible + .track {
    box-shadow: 0 0 0 3px rgba(103, 58, 183, 0.25);
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .lbl {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--ink);
    line-height: 1.35;
  }
  .hint {
    font-size: 0.6875rem;
    color: var(--muted);
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
