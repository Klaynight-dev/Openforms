/**
 * Identité visuelle (DA) des exports statistiques.
 *
 * La page Statistiques exporte des PNG « nus » sortis d'ECharts. Ce module
 * ajoute par-dessus un habillage composé sur un canvas : en-tête (logo, titre,
 * sous-titre), graphique, légende libre, pied de page automatique. Les réglages
 * sont persistés sur le formulaire (champ `exportTheme`) via
 * `api.updateExportTheme`, et servent aussi de source de vérité pour la palette
 * des graphiques à l'écran.
 */

export type LogoPosition = "top-left" | "top-right" | "footer";
export type ExportRatio = "auto" | "16:9" | "4:3" | "1:1";
export type ExportScale = 1 | 2 | 3;

export interface ExportTheme {
  /** Titre incrusté. Vide = titre du graphique exporté. */
  title: string;
  subtitle: string;
  /** Note libre sous le graphique (source, méthodo, commentaire d'analyse). */
  caption: string;
  logoDataUrl: string | null;
  logoPosition: LogoPosition;
  /** Palette catégorielle (camemberts, histogrammes, grilles). */
  palette: string[];
  fontFamily: string;
  theme: "light" | "dark";
  /** Couleur d'accent : courbe d'évolution, rampes de heatmap, filets. */
  accentColor: string;
  ratio: ExportRatio;
  scale: ExportScale;
  showDate: boolean;
  showCount: boolean;
  showFilters: boolean;
  showFormTitle: boolean;
  legalNotice: string;
}

export const DEFAULT_PALETTE = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

export const DEFAULT_EXPORT_THEME: ExportTheme = {
  title: "",
  subtitle: "",
  caption: "",
  logoDataUrl: null,
  logoPosition: "top-right",
  palette: DEFAULT_PALETTE,
  fontFamily: "Outfit",
  theme: "light",
  accentColor: "#22c55e",
  ratio: "auto",
  scale: 2,
  showDate: true,
  showCount: true,
  showFilters: true,
  showFormTitle: true,
  legalNotice: "",
};

export const PALETTE_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Openforms", colors: ["#673ab7", "#22c55e", "#f59e0b", "#0ea5e9", "#ec4899", "#14b8a6", "#f43f5e", "#a3a3a3"] },
  { name: "Vert", colors: DEFAULT_PALETTE },
  { name: "Océan", colors: ["#0ea5e9", "#0891b2", "#2563eb", "#4f46e5", "#7c3aed", "#0d9488", "#155e75", "#64748b"] },
  { name: "Chaleur", colors: ["#f97316", "#ef4444", "#f59e0b", "#dc2626", "#eab308", "#b45309", "#fb7185", "#78350f"] },
  { name: "Sobre", colors: ["#334155", "#64748b", "#94a3b8", "#cbd5e1", "#1e293b", "#475569", "#e2e8f0", "#0f172a"] },
  // Palette Okabe–Ito : discriminable par les principales formes de daltonisme.
  { name: "Accessible", colors: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#000000"] },
];

/** Familles sûres pour un rendu canvas : chargées par l'app ou présentes sur l'OS. */
export const FONT_PRESETS = [
  { name: "Outfit (défaut)", value: "Outfit" },
  { name: "Système", value: "system-ui" },
  { name: "Arial", value: "Arial" },
  { name: "Georgia (serif)", value: "Georgia" },
  { name: "Times New Roman", value: "Times New Roman" },
  { name: "Courier New (mono)", value: "Courier New" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Reconstruit un thème complet à partir d'un JSON partiel venu de l'API. */
export function normalizeExportTheme(raw: unknown): ExportTheme {
  const src = (raw ?? {}) as Partial<ExportTheme>;
  const str = (v: unknown, max: number, fallback = "") =>
    typeof v === "string" ? v.slice(0, max) : fallback;
  const palette = Array.isArray(src.palette)
    ? src.palette.filter((c): c is string => typeof c === "string" && HEX_RE.test(c))
    : [];

  return {
    title: str(src.title, 200),
    subtitle: str(src.subtitle, 300),
    caption: str(src.caption, 1000),
    logoDataUrl:
      typeof src.logoDataUrl === "string" && src.logoDataUrl.startsWith("data:image/")
        ? src.logoDataUrl
        : null,
    logoPosition: (["top-left", "top-right", "footer"] as const).includes(src.logoPosition as LogoPosition)
      ? (src.logoPosition as LogoPosition)
      : DEFAULT_EXPORT_THEME.logoPosition,
    palette: palette.length > 0 ? palette : DEFAULT_PALETTE,
    fontFamily: str(src.fontFamily, 200, DEFAULT_EXPORT_THEME.fontFamily) || DEFAULT_EXPORT_THEME.fontFamily,
    theme: src.theme === "dark" ? "dark" : "light",
    accentColor:
      typeof src.accentColor === "string" && HEX_RE.test(src.accentColor)
        ? src.accentColor
        : DEFAULT_EXPORT_THEME.accentColor,
    ratio: (["auto", "16:9", "4:3", "1:1"] as const).includes(src.ratio as ExportRatio)
      ? (src.ratio as ExportRatio)
      : "auto",
    scale: src.scale === 1 || src.scale === 3 ? src.scale : 2,
    showDate: src.showDate ?? DEFAULT_EXPORT_THEME.showDate,
    showCount: src.showCount ?? DEFAULT_EXPORT_THEME.showCount,
    showFilters: src.showFilters ?? DEFAULT_EXPORT_THEME.showFilters,
    showFormTitle: src.showFormTitle ?? DEFAULT_EXPORT_THEME.showFormTitle,
    legalNotice: str(src.legalNotice, 300),
  };
}

/** true si le thème ne diffère pas des valeurs par défaut (rien à persister). */
export function isDefaultTheme(theme: ExportTheme): boolean {
  return JSON.stringify(theme) === JSON.stringify(DEFAULT_EXPORT_THEME);
}

// --- Couleurs dérivées -------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Mélange `hex` vers le blanc (amount>0) ou le noir (amount<0), amount dans [-1,1]. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Rampe séquentielle en 4 paliers construite depuis la couleur d'accent. */
export function heatRamp(accent: string): string[] {
  return [shade(accent, 0.92), shade(accent, 0.45), accent, shade(accent, -0.35)];
}

// --- Palette de composition --------------------------------------------------

interface Surface {
  bg: string;
  ink: string;
  muted: string;
  line: string;
}

export function surfaceOf(theme: ExportTheme): Surface {
  return theme.theme === "dark"
    ? { bg: "#0f172a", ink: "#f1f5f9", muted: "#94a3b8", line: "#1e293b" }
    : { bg: "#ffffff", ink: "#1e293b", muted: "#64748b", line: "#e2e8f0" };
}

// --- Rendu -------------------------------------------------------------------

export interface ExportRenderContext {
  /** Titre par défaut du graphique, utilisé si le thème n'en impose pas. */
  chartTitle: string;
  formTitle: string;
  responseCount: number;
  /** Filtres actifs, déjà formatés pour l'affichage. */
  filterSummary: string[];
}

/** Source minimale d'image : une instance ECharts suffit. */
export interface ChartImageSource {
  getDataURL(opts: { type: "png"; pixelRatio: number; backgroundColor: string }): string;
}

const PAD = 36;
const LOGO_MAX_H = 44;
const GAP = 18;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}

/** Découpe `text` en lignes ne dépassant pas `maxWidth` (mesure réelle). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function footerParts(theme: ExportTheme, ctx: ExportRenderContext): string[] {
  const parts: string[] = [];
  if (theme.showFormTitle && ctx.formTitle) parts.push(ctx.formTitle);
  if (theme.showCount) {
    parts.push(`n = ${ctx.responseCount} réponse${ctx.responseCount > 1 ? "s" : ""}`);
  }
  if (theme.showDate) {
    parts.push(
      `Export du ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
    );
  }
  if (theme.showFilters && ctx.filterSummary.length > 0) {
    parts.push(`Filtres : ${ctx.filterSummary.join(" ; ")}`);
  }
  if (theme.legalNotice) parts.push(theme.legalNotice);
  return parts;
}

/**
 * Compose le graphique et son habillage sur un canvas prêt à télécharger.
 * Le canvas est dimensionné en pixels CSS puis mis à l'échelle `theme.scale`,
 * de sorte que l'image ECharts (déjà rendue à ce pixelRatio) reste nette.
 */
export async function renderExportImage(
  chart: ChartImageSource,
  theme: ExportTheme,
  renderCtx: ExportRenderContext,
): Promise<HTMLCanvasElement> {
  const surface = surfaceOf(theme);
  const scale = theme.scale;
  const font = (size: number, weight = "400") =>
    `${weight} ${size}px "${theme.fontFamily}", "Outfit", system-ui, sans-serif`;

  const chartImg = await loadImage(
    chart.getDataURL({ type: "png", pixelRatio: scale, backgroundColor: surface.bg }),
  );
  const chartW = chartImg.width / scale;
  const chartH = chartImg.height / scale;

  const logo = theme.logoDataUrl ? await loadImage(theme.logoDataUrl).catch(() => null) : null;
  const logoH = logo ? Math.min(LOGO_MAX_H, logo.height) : 0;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;
  const headerLogo = logo && theme.logoPosition !== "footer" ? logo : null;
  const footerLogo = logo && theme.logoPosition === "footer" ? logo : null;

  const title = theme.title || renderCtx.chartTitle;
  const subtitle = theme.subtitle;
  const caption = theme.caption.trim();
  const footer = footerParts(theme, renderCtx);

  // --- Passe 1 : mesure ---
  const scratch = document.createElement("canvas").getContext("2d")!;
  const contentW = chartW;
  const titleReserve = headerLogo ? logoW + GAP : 0;

  scratch.font = font(22, "600");
  const titleLines = title ? wrapText(scratch, title, contentW - titleReserve) : [];
  scratch.font = font(14);
  const subtitleLines = subtitle ? wrapText(scratch, subtitle, contentW - titleReserve) : [];
  scratch.font = font(13);
  const captionLines = caption ? wrapText(scratch, caption, contentW - 16) : [];
  scratch.font = font(11);
  const footerLines = footer.length
    ? wrapText(scratch, footer.join("  ·  "), contentW - (footerLogo ? logoW + GAP : 0))
    : [];

  const textHeaderH = titleLines.length * 30 + (subtitleLines.length ? subtitleLines.length * 20 + 4 : 0);
  const headerH = Math.max(textHeaderH, headerLogo ? logoH : 0);
  const captionH = captionLines.length ? captionLines.length * 20 + 12 : 0;
  const footerH = footerLines.length
    ? Math.max(footerLines.length * 16, footerLogo ? logoH : 0) + 12
    : 0;

  let width = contentW + PAD * 2;
  let height =
    PAD +
    (headerH ? headerH + GAP : 0) +
    chartH +
    (captionH ? GAP + captionH : 0) +
    (footerH ? GAP + footerH : 0) +
    PAD;

  // Ratio imposé : on n'écrase jamais le contenu, on ajoute de la marge.
  const ratios: Record<Exclude<ExportRatio, "auto">, number> = { "16:9": 9 / 16, "4:3": 3 / 4, "1:1": 1 };
  let offsetX = 0;
  let offsetY = 0;
  if (theme.ratio !== "auto") {
    const r = ratios[theme.ratio];
    const targetH = width * r;
    if (targetH >= height) {
      offsetY = (targetH - height) / 2;
      height = targetH;
    } else {
      const targetW = height / r;
      offsetX = (targetW - width) / 2;
      width = targetW;
    }
  }

  // --- Passe 2 : dessin ---
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = surface.bg;
  ctx.fillRect(0, 0, width, height);

  // Filet d'accent en haut : signature visuelle de l'export.
  ctx.fillStyle = theme.accentColor;
  ctx.fillRect(0, 0, width, 5);

  const left = PAD + offsetX;
  let y = PAD + offsetY;

  if (headerH) {
    if (headerLogo) {
      const lx = theme.logoPosition === "top-left" ? left : left + contentW - logoW;
      ctx.drawImage(headerLogo, lx, y, logoW, logoH);
    }
    const textLeft = theme.logoPosition === "top-left" && headerLogo ? left + logoW + GAP : left;
    let ty = y + 22;
    ctx.fillStyle = surface.ink;
    ctx.font = font(22, "600");
    for (const line of titleLines) {
      ctx.fillText(line, textLeft, ty);
      ty += 30;
    }
    if (subtitleLines.length) {
      ctx.fillStyle = surface.muted;
      ctx.font = font(14);
      ty += 2;
      for (const line of subtitleLines) {
        ctx.fillText(line, textLeft, ty);
        ty += 20;
      }
    }
    y += headerH + GAP;
  }

  ctx.drawImage(chartImg, left, y, chartW, chartH);
  y += chartH;

  if (captionLines.length) {
    y += GAP;
    // Barre d'accent à gauche de la légende, façon citation.
    ctx.fillStyle = rgba(theme.accentColor, 0.55);
    ctx.fillRect(left, y - 2, 3, captionLines.length * 20 + 4);
    ctx.fillStyle = surface.muted;
    ctx.font = font(13);
    let cy = y + 13;
    for (const line of captionLines) {
      ctx.fillText(line, left + 14, cy);
      cy += 20;
    }
    y += captionH;
  }

  if (footerLines.length) {
    y += GAP;
    ctx.strokeStyle = surface.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y - 8 + 0.5);
    ctx.lineTo(left + contentW, y - 8 + 0.5);
    ctx.stroke();

    if (footerLogo) {
      ctx.drawImage(footerLogo, left + contentW - logoW, y, logoW, logoH);
    }
    ctx.fillStyle = surface.muted;
    ctx.font = font(11);
    let fy = y + 11;
    for (const line of footerLines) {
      ctx.fillText(line, left, fy);
      fy += 16;
    }
  }

  return canvas;
}

/** Déclenche le téléchargement d'un canvas en PNG. */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

/** Copie un canvas dans le presse-papiers (si l'API est disponible). */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Rendu impossible.");
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Presse-papiers indisponible sur ce navigateur.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
