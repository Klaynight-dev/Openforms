<script lang="ts">
  /**
   * Panneau « Personnalisation des exports » de la page Statistiques.
   *
   * Un seul endroit pour la direction artistique : ce qui est réglé ici
   * s'applique à tous les graphiques exportés *et* à leur rendu à l'écran
   * (palette, couleur d'accent). Les réglages sont persistés sur le formulaire,
   * donc partagés par tous les éditeurs et conservés d'une session à l'autre.
   */
  import {
    DEFAULT_EXPORT_THEME,
    FONT_PRESETS,
    PALETTE_PRESETS,
    type ExportRatio,
    type ExportScale,
    type ExportTheme,
    type LogoPosition,
  } from "$lib/exportTheme.ts";
  import Segmented from "./Segmented.svelte";
  import Switch from "./Switch.svelte";
  import {
    IconCaretDown,
    IconCaretUp,
    IconImage,
    IconPalette,
    IconPlus,
    IconReset,
    IconSave,
    IconTrash,
  } from "$lib/icons.ts";

  interface Props {
    theme: ExportTheme;
    canEdit: boolean;
    /** Vrai tant que le thème enregistré diffère du thème courant. */
    dirty: boolean;
    saving: boolean;
    open: boolean;
    onsave: () => void;
    onreset: () => void;
  }

  let {
    theme = $bindable(),
    canEdit,
    dirty,
    saving,
    open = $bindable(),
    onsave,
    onreset,
  }: Props = $props();

  const MAX_LOGO_BYTES = 300_000;
  const ACCEPTED_LOGO = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

  let logoError = $state<string | null>(null);

  function pickLogo(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    logoError = null;

    if (!ACCEPTED_LOGO.includes(file.type)) {
      logoError = "Formats acceptés : PNG, JPEG, WebP ou SVG.";
      input.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      logoError = `Logo trop lourd (${Math.round(file.size / 1024)} Ko). Maximum 300 Ko.`;
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      theme.logoDataUrl = String(reader.result);
    };
    reader.onerror = () => {
      logoError = "Lecture du fichier impossible.";
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function applyPreset(colors: string[]) {
    theme.palette = [...colors];
    theme.accentColor = colors[0];
  }

  function setPaletteColor(index: number, color: string) {
    const next = [...theme.palette];
    next[index] = color;
    theme.palette = next;
  }

  function addColor() {
    theme.palette = [...theme.palette, "#94a3b8"];
  }

  function removeColor(index: number) {
    if (theme.palette.length <= 2) return;
    theme.palette = theme.palette.filter((_, i) => i !== index);
  }

  const activePreset = $derived(
    PALETTE_PRESETS.find((p) => p.colors.join() === theme.palette.join())?.name ?? null,
  );
</script>

<section class="panel" aria-labelledby="export-panel-title">
  <div class="panel-head">
    <button
      type="button"
      class="flex flex-1 items-center gap-2 text-left"
      aria-expanded={open}
      aria-controls="export-panel-body"
      onclick={() => (open = !open)}
    >
      <span class="grid h-8 w-8 place-items-center rounded-xl" style="background: var(--brand-50); color: var(--brand)">
        <IconPalette size={17} />
      </span>
      <span class="min-w-0">
        <span id="export-panel-title" class="block text-sm font-semibold" style="color: var(--ink)">
          Personnalisation des exports
        </span>
        <span class="block text-[11px]" style="color: var(--muted)">
          Titre, légende, logo et palette appliqués aux images exportées
          {#if dirty}<span class="font-semibold" style="color: var(--brand)"> · modifications non enregistrées</span>{/if}
        </span>
      </span>
      {#if open}<IconCaretUp size={15} />{:else}<IconCaretDown size={15} />{/if}
    </button>
  </div>

  {#if open}
    <div class="panel-body" id="export-panel-body">
      {#if !canEdit}
        <p class="mb-4 rounded-xl px-3 py-2 text-xs" style="background: var(--surface-alt); color: var(--muted)">
          Vous consultez ces réglages en lecture seule : seuls les éditeurs du formulaire peuvent
          les modifier. Vos exports utiliseront l'habillage enregistré.
        </p>
      {/if}

      <fieldset disabled={!canEdit} class="grid gap-6 lg:grid-cols-2">
        <!-- Textes -->
        <div>
          <span class="section-label">Textes incrustés</span>
          <div class="grid gap-3">
            <label class="block">
              <span class="label !mb-1 !text-xs">Titre</span>
              <input
                class="input"
                placeholder="Par défaut : le titre du graphique exporté"
                maxlength="200"
                bind:value={theme.title}
              />
            </label>
            <label class="block">
              <span class="label !mb-1 !text-xs">Sous-titre</span>
              <input
                class="input"
                placeholder="Ex : Saison 2025-2026- Club de natation"
                maxlength="300"
                bind:value={theme.subtitle}
              />
            </label>
            <label class="block">
              <span class="label !mb-1 !text-xs">Légende</span>
              <textarea
                class="textarea"
                placeholder="Note affichée sous le graphique : source, méthodologie, période, commentaire d'analyse…"
                maxlength="1000"
                bind:value={theme.caption}
              ></textarea>
              <span class="mt-1 block text-[11px]" style="color: var(--muted)">
                {theme.caption.length}/1000 · les retours à la ligne sont conservés
              </span>
            </label>
          </div>
        </div>

        <!-- Identité visuelle -->
        <div>
          <span class="section-label">Identité visuelle</span>

          <div class="mb-4">
            <span class="label !mb-1.5 !text-xs">Logo</span>
            <div class="flex items-center gap-3">
              <div
                class="checker grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-xl"
                style="border: 1px solid var(--line)"
              >
                {#if theme.logoDataUrl}
                  <img src={theme.logoDataUrl} alt="Logo utilisé dans les exports" class="max-h-12 max-w-20 object-contain" />
                {:else}
                  <IconImage size={20} />
                {/if}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn-secondary !px-3 !py-1.5 !text-xs cursor-pointer">
                  <IconImage size={14} /> {theme.logoDataUrl ? "Remplacer" : "Importer"}
                  <input
                    type="file"
                    class="hidden"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onchange={pickLogo}
                  />
                </label>
                {#if theme.logoDataUrl}
                  <button
                    type="button"
                    class="btn-chip"
                    onclick={() => (theme.logoDataUrl = null)}
                  >
                    <IconTrash size={13} /> Retirer
                  </button>
                {/if}
              </div>
            </div>
            {#if logoError}
              <p class="mt-1.5 text-[11px] font-semibold" style="color: var(--danger)">{logoError}</p>
            {:else}
              <p class="mt-1.5 text-[11px]" style="color: var(--muted)">PNG, JPEG, WebP ou SVG · 300 Ko max</p>
            {/if}
            {#if theme.logoDataUrl}
              <div class="mt-2">
                <Segmented
                  label="Position du logo"
                  dense
                  value={theme.logoPosition}
                  options={[
                    { value: "top-left", label: "Haut gauche" },
                    { value: "top-right", label: "Haut droite" },
                    { value: "footer", label: "Pied de page" },
                  ]}
                  onchange={(v) => (theme.logoPosition = v as LogoPosition)}
                />
              </div>
            {/if}
          </div>

          <div class="mb-4">
            <span class="label !mb-1.5 !text-xs">Palette des graphiques</span>
            <div class="mb-2 flex flex-wrap gap-1.5">
              {#each PALETTE_PRESETS as preset (preset.name)}
                <button
                  type="button"
                  class="preset"
                  class:preset-active={activePreset === preset.name}
                  title="Appliquer la palette {preset.name}"
                  onclick={() => applyPreset(preset.colors)}
                >
                  <span class="flex">
                    {#each preset.colors.slice(0, 5) as color (color)}
                      <span class="swatch-mini" style="background:{color}"></span>
                    {/each}
                  </span>
                  {preset.name}
                </button>
              {/each}
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              {#each theme.palette as color, i (i)}
                <span class="swatch-wrap">
                  <input
                    type="color"
                    value={color}
                    aria-label="Couleur {i + 1} de la palette"
                    oninput={(e) => setPaletteColor(i, e.currentTarget.value)}
                  />
                  {#if theme.palette.length > 2}
                    <button
                      type="button"
                      class="swatch-del"
                      aria-label="Retirer la couleur {i + 1}"
                      onclick={() => removeColor(i)}>×</button
                    >
                  {/if}
                </span>
              {/each}
              <button type="button" class="btn-icon !h-7 !w-7" aria-label="Ajouter une couleur" onclick={addColor}>
                <IconPlus size={13} />
              </button>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="label !mb-1 !text-xs">Couleur d'accent</span>
              <span class="flex items-center gap-2">
                <input
                  type="color"
                  class="h-9 w-12 cursor-pointer rounded-lg"
                  style="border: 1px solid var(--line)"
                  bind:value={theme.accentColor}
                  aria-label="Couleur d'accent"
                />
                <span class="text-[11px]" style="color: var(--muted)">Courbes, filets, heatmaps</span>
              </span>
            </label>
            <label class="block">
              <span class="label !mb-1 !text-xs">Police</span>
              <select class="input" bind:value={theme.fontFamily}>
                {#each FONT_PRESETS as font (font.value)}
                  <option value={font.value}>{font.name}</option>
                {/each}
              </select>
            </label>
          </div>
        </div>

        <!-- Format -->
        <div>
          <span class="section-label">Format de l'image</span>
          <div class="grid gap-3">
            <div>
              <span class="label !mb-1.5 !text-xs">Fond</span>
              <Segmented
                label="Fond de l'image exportée"
                value={theme.theme}
                options={[
                  { value: "light", label: "Clair" },
                  { value: "dark", label: "Sombre" },
                ]}
                onchange={(v) => (theme.theme = v as "light" | "dark")}
              />
            </div>
            <div>
              <span class="label !mb-1.5 !text-xs">Proportions</span>
              <Segmented
                label="Proportions de l'image"
                value={theme.ratio}
                options={[
                  { value: "auto", label: "Auto", title: "Hauteur ajustée au contenu" },
                  { value: "16:9", label: "16:9", title: "Diaporama" },
                  { value: "4:3", label: "4:3", title: "Document" },
                  { value: "1:1", label: "1:1", title: "Réseaux sociaux" },
                ]}
                onchange={(v) => (theme.ratio = v as ExportRatio)}
              />
              <p class="mt-1 text-[11px]" style="color: var(--muted)">
                Le contenu n'est jamais rogné : de la marge est ajoutée pour atteindre le format.
              </p>
            </div>
            <div>
              <span class="label !mb-1.5 !text-xs">Résolution</span>
              <Segmented
                label="Résolution de l'image"
                value={theme.scale}
                options={[
                  { value: 1, label: "×1", title: "Écran" },
                  { value: 2, label: "×2", title: "Rétina / impression courante" },
                  { value: 3, label: "×3", title: "Grande impression" },
                ]}
                onchange={(v) => (theme.scale = v as ExportScale)}
              />
            </div>
          </div>
        </div>

        <!-- Pied de page -->
        <div>
          <span class="section-label">Pied de page automatique</span>
          <div class="grid gap-2.5">
            <Switch
              checked={theme.showFormTitle}
              label="Nom du formulaire"
              onchange={(v) => (theme.showFormTitle = v)}
            />
            <Switch
              checked={theme.showCount}
              label="Nombre de réponses"
              hint="Affiché sous la forme « n = 128 réponses »"
              onchange={(v) => (theme.showCount = v)}
            />
            <Switch
              checked={theme.showDate}
              label="Date d'export"
              onchange={(v) => (theme.showDate = v)}
            />
            <Switch
              checked={theme.showFilters}
              label="Filtres actifs"
              hint="Indispensable pour qu'un graphique filtré ne soit pas lu comme un total"
              onchange={(v) => (theme.showFilters = v)}
            />
            <label class="mt-1 block">
              <span class="label !mb-1 !text-xs">Mention légale</span>
              <input
                class="input"
                placeholder="Ex : © Club de natation- diffusion interne"
                maxlength="300"
                bind:value={theme.legalNotice}
              />
            </label>
          </div>
        </div>
      </fieldset>

      {#if canEdit}
        <div class="mt-5 flex flex-wrap items-center justify-end gap-2 pt-4" style="border-top: 1px solid var(--line)">
          <button type="button" class="btn-text !text-xs" onclick={onreset} disabled={saving}>
            <IconReset size={14} /> Réinitialiser
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2 !text-xs"
            onclick={onsave}
            disabled={saving || !dirty}
          >
            <IconSave size={14} />
            {saving ? "Enregistrement…" : dirty ? "Enregistrer l'habillage" : "Habillage enregistré"}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style lang="scss">
  fieldset:disabled {
    opacity: 0.6;
  }

  .preset {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem 0.25rem 0.3125rem;
    border-radius: 0.625rem;
    border: 1px solid var(--line);
    background: #fff;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--muted);
  }
  .preset:hover {
    border-color: var(--brand-100);
    background: var(--brand-50);
    color: var(--brand-700);
  }
  .preset-active {
    border-color: var(--brand);
    background: var(--brand-50);
    color: var(--brand-700);
  }

  .swatch-mini {
    height: 0.875rem;
    width: 0.4375rem;
    &:first-child {
      border-radius: 3px 0 0 3px;
    }
    &:last-child {
      border-radius: 0 3px 3px 0;
    }
  }

  .swatch-wrap {
    position: relative;
    display: inline-block;
    line-height: 0;

    input[type="color"] {
      height: 1.75rem;
      width: 1.75rem;
      cursor: pointer;
      border-radius: 0.5rem;
      border: 1px solid var(--line);
      padding: 0;
      background: none;
    }

    .swatch-del {
      position: absolute;
      top: -0.3125rem;
      right: -0.3125rem;
      display: none;
      height: 0.875rem;
      width: 0.875rem;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--danger);
      color: #fff;
      font-size: 0.625rem;
      line-height: 1;
    }

    &:hover .swatch-del,
    .swatch-del:focus-visible {
      display: flex;
    }
  }
</style>
