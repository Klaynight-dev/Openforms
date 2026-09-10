<script lang="ts">
  /**
   * Menu d'export des données : un seul bouton, trois formats.
   *
   * Avant, chaque format avait son bouton dans la barre d'outils ; à trois
   * formats le menu tient moins de place et laisse de l'air pour indiquer ce
   * que contient chaque fichier.
   */
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { exportData, FORMAT_LABELS, type DataExportOptions, type DataFormat } from "$lib/dataExport.ts";
  import { IconCaretDown, IconCsv, IconDownload, IconExcel, IconJson } from "$lib/icons.ts";

  interface Props {
    /** Construit les options au moment du clic : les données peuvent être volumineuses. */
    build: (format: DataFormat) => DataExportOptions;
    /** Nombre de lignes concernées, affiché pour lever le doute sur les filtres. */
    rowCount: number;
    label?: string;
    /** Style compact pour les barres d'outils denses. */
    dense?: boolean;
    disabled?: boolean;
  }

  let { build, rowCount, label = "Exporter", dense = false, disabled = false }: Props = $props();

  const ICONS = { xlsx: IconExcel, csv: IconCsv, json: IconJson };
  const HINTS: Record<DataFormat, string> = {
    xlsx: "En-tête figé, filtres et onglet de contexte",
    csv: "Universel, séparateur virgule, UTF-8",
    json: "Structuré, pour un traitement automatisé",
  };

  let open = $state(false);
  let busy = $state<DataFormat | null>(null);
  let root = $state<HTMLDivElement>();

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  async function run(format: DataFormat) {
    busy = format;
    try {
      await exportData(build(format));
      toasts.success(
        `${rowCount} ligne${rowCount > 1 ? "s" : ""} exportée${rowCount > 1 ? "s" : ""} en ${FORMAT_LABELS[format]}.`,
      );
      open = false;
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Export impossible.");
    } finally {
      busy = null;
    }
  }
</script>

<div class="wrap" bind:this={root}>
  <button
    type="button"
    class={dense ? "btn-chip" : "btn-secondary !px-3 !py-1.5 !text-xs"}
    aria-haspopup="menu"
    aria-expanded={open}
    disabled={disabled || rowCount === 0}
    title={rowCount === 0 ? "Aucune donnée à exporter" : `Exporter ${rowCount} ligne(s)`}
    onclick={() => (open = !open)}
  >
    <IconDownload size={dense ? 13 : 15} /> {label}
    <IconCaretDown size={dense ? 11 : 13} />
  </button>

  {#if open}
    <div class="menu" role="menu">
      <p class="menu-head">
        {rowCount} ligne{rowCount > 1 ? "s" : ""} · les filtres actifs sont appliqués
      </p>
      {#each Object.keys(FORMAT_LABELS) as format (format)}
        {@const Icon = ICONS[format as DataFormat]}
        <button
          type="button"
          role="menuitem"
          class="item"
          disabled={busy !== null}
          onclick={() => run(format as DataFormat)}
        >
          <Icon size={17} />
          <span class="min-w-0">
            <span class="item-label">
              {FORMAT_LABELS[format as DataFormat]}
              {#if busy === format}<span class="pending"> · génération…</span>{/if}
            </span>
            <span class="item-hint">{HINTS[format as DataFormat]}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .wrap {
    position: relative;
    display: inline-block;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.375rem);
    z-index: 40;
    width: 17.5rem;
    padding: 0.375rem;
    border-radius: 0.875rem;
    border: 1px solid var(--line);
    background: #fff;
    box-shadow:
      0 12px 28px -8px rgba(15, 23, 42, 0.2),
      0 4px 10px -6px rgba(15, 23, 42, 0.12);
  }

  .menu-head {
    padding: 0.375rem 0.5rem 0.5rem;
    font-size: 0.6875rem;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
    margin-bottom: 0.25rem;
  }

  .item {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5rem;
    border-radius: 0.625rem;
    text-align: left;
    color: var(--ink-soft);
  }
  .item:hover:not(:disabled) {
    background: var(--brand-50);
    color: var(--brand-700);
  }
  .item:disabled {
    opacity: 0.6;
  }

  .item-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink);
  }
  .item-hint {
    display: block;
    font-size: 0.6875rem;
    color: var(--muted);
    line-height: 1.35;
  }
  .pending {
    font-weight: 400;
    color: var(--brand);
  }
</style>
