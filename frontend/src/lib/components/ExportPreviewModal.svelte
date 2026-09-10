<script lang="ts">
  /**
   * Aperçu avant téléchargement d'un graphique habillé.
   *
   * Le titre et la légende sont éditables ici pour l'export en cours : on
   * annote une image sans avoir à modifier — puis restaurer — les réglages
   * globaux. « Appliquer à tous les exports » promeut ces valeurs dans le
   * thème du formulaire.
   */
  import Modal from "./Modal.svelte";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import {
    copyCanvas,
    downloadCanvas,
    renderExportImage,
    type ChartImageSource,
    type ExportRenderContext,
    type ExportTheme,
  } from "$lib/exportTheme.ts";
  import { IconClipboard, IconDownload, IconPalette } from "$lib/icons.ts";

  interface Props {
    open: boolean;
    /** Graphique à exporter (instance ECharts). */
    chart: ChartImageSource | null;
    theme: ExportTheme;
    context: ExportRenderContext;
    filename: string;
    canEdit: boolean;
    onclose: () => void;
    /** Promeut les textes de cet export dans les réglages du formulaire. */
    onpromote: (patch: Pick<ExportTheme, "title" | "subtitle" | "caption">) => void;
  }

  let { open, chart, theme, context, filename, canEdit, onclose, onpromote }: Props = $props();

  // Surcharges locales, réinitialisées à chaque ouverture.
  let title = $state("");
  let subtitle = $state("");
  let caption = $state("");
  let seeded = false;

  let previewUrl = $state<string | null>(null);
  let rendering = $state(false);
  let renderError = $state<string | null>(null);
  // $state et non `let` simple : `disabled={!canvas}` en dépend.
  let canvas = $state<HTMLCanvasElement | null>(null);

  const effectiveTheme = $derived<ExportTheme>({ ...theme, title, subtitle, caption });

  $effect(() => {
    if (!open) {
      seeded = false;
      previewUrl = null;
      canvas = null;
      return;
    }
    if (!seeded) {
      seeded = true;
      title = theme.title || context.chartTitle;
      subtitle = theme.subtitle;
      caption = theme.caption;
    }
  });

  // Recompose l'aperçu à chaque changement, avec un court délai pour ne pas
  // relancer un rendu à chaque frappe.
  $effect(() => {
    if (!open || !chart) return;
    const snapshot = effectiveTheme;
    rendering = true;
    const timer = setTimeout(async () => {
      try {
        canvas = await renderExportImage(chart, snapshot, context);
        previewUrl = canvas.toDataURL("image/png");
        renderError = null;
      } catch (err) {
        renderError = err instanceof Error ? err.message : "Rendu impossible.";
      } finally {
        rendering = false;
      }
    }, 220);
    return () => clearTimeout(timer);
  });

  function download() {
    if (!canvas) return;
    downloadCanvas(canvas, filename);
    toasts.success("Image exportée.");
    onclose();
  }

  async function copy() {
    if (!canvas) return;
    try {
      await copyCanvas(canvas);
      toasts.success("Image copiée dans le presse-papiers.");
    } catch (err) {
      toasts.error(err);
    }
  }

  function promote() {
    onpromote({ title, subtitle, caption });
  }

  const promotable = $derived(
    canEdit && (title !== theme.title || subtitle !== theme.subtitle || caption !== theme.caption),
  );
</script>

<Modal {open} title="Exporter le graphique" size="xl" {onclose}
  description="Ajustez le titre et la légende de cette image, puis téléchargez-la.">
  <div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
    <div class="preview" class:dark={theme.theme === "dark"}>
      {#if renderError}
        <p class="p-6 text-center text-sm font-semibold" style="color: var(--danger)">{renderError}</p>
      {:else if previewUrl}
        <img src={previewUrl} alt="Aperçu de l'export tel qu'il sera téléchargé" class:stale={rendering} />
      {:else}
        <p class="p-10 text-center text-xs" style="color: var(--muted)">Composition de l'aperçu…</p>
      {/if}
    </div>

    <div class="grid content-start gap-3">
      <label class="block">
        <span class="label !mb-1 !text-xs">Titre</span>
        <input class="input" maxlength="200" bind:value={title} />
      </label>
      <label class="block">
        <span class="label !mb-1 !text-xs">Sous-titre</span>
        <input class="input" maxlength="300" placeholder="Facultatif" bind:value={subtitle} />
      </label>
      <label class="block">
        <span class="label !mb-1 !text-xs">Légende</span>
        <textarea
          class="textarea"
          maxlength="1000"
          placeholder="Source, méthodologie, commentaire d'analyse…"
          bind:value={caption}
        ></textarea>
      </label>

      <div class="rounded-xl px-3 py-2.5 text-[11px] leading-relaxed" style="background: var(--surface-alt); color: var(--muted)">
        <span class="font-semibold" style="color: var(--ink-soft)">Habillage appliqué</span><br />
        Fond {theme.theme === "dark" ? "sombre" : "clair"} · {theme.ratio === "auto" ? "hauteur automatique" : theme.ratio} ·
        résolution ×{theme.scale}{theme.logoDataUrl ? " · logo" : ""}
        {#if theme.legalNotice}<br />Mention : {theme.legalNotice}{/if}
      </div>

      {#if promotable}
        <button type="button" class="btn-secondary !px-3 !py-2 !text-xs" onclick={promote}>
          <IconPalette size={14} /> Appliquer à tous les exports
        </button>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <button type="button" class="btn-text !text-sm" onclick={onclose}>Annuler</button>
    <button type="button" class="btn-secondary !px-4 !py-2 !text-sm" onclick={copy} disabled={!canvas}>
      <IconClipboard size={15} /> Copier
    </button>
    <button type="button" class="btn-primary !px-4 !py-2 !text-sm" onclick={download} disabled={!canvas || rendering}>
      <IconDownload size={15} /> Télécharger le PNG
    </button>
  {/snippet}
</Modal>

<style lang="scss">
  .preview {
    display: grid;
    place-items: center;
    min-height: 12rem;
    padding: 0.75rem;
    border-radius: 0.875rem;
    border: 1px solid var(--line);
    background: var(--surface-alt);
    overflow: auto;

    &.dark {
      background: #1e293b;
    }

    img {
      max-width: 100%;
      max-height: 60vh;
      border-radius: 0.5rem;
      box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.18);
      transition: opacity 0.15s;
    }

    img.stale {
      opacity: 0.55;
    }
  }
</style>
