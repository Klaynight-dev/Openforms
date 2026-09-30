/**
 * Statistiques calculées à partir des réponses, pour le serveur MCP.
 *
 * L'API ne sert que les réponses brutes (la page Statistiques calcule côté
 * navigateur) : on agrège ici, sur les mêmes données, avec les mêmes filtres.
 */

export interface Field {
  key: string;
  type: string;
  label: string;
  options?: { value: string; label: string }[];
  grid?: { rows: string[]; columns: string[] };
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
}

export interface Row {
  id: string;
  submittedAt: string;
  values: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RowFilter {
  dateStart?: string;
  dateEnd?: string;
  /** Ne garder que les réponses dont le champ vaut l'une de ces valeurs. */
  filters?: Record<string, string[]>;
}

/** Types sans réponse à agréger. */
const LAYOUT_TYPES = new Set(["section", "text_block"]);
const CHOICE_TYPES = new Set(["radio", "select", "rotation"]);

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Valeurs d'une réponse sous forme de liste (un choix multiple en compte plusieurs). */
function valuesOf(v: unknown): string[] {
  if (isEmpty(v)) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

export function filterRows(rows: Row[], { dateStart, dateEnd, filters }: RowFilter): Row[] {
  const start = dateStart ? Date.parse(dateStart) : NaN;
  // Une date seule couvre toute la journée de fin.
  const end = dateEnd ? Date.parse(dateEnd.length === 10 ? `${dateEnd}T23:59:59.999Z` : dateEnd) : NaN;
  return rows.filter((row) => {
    const at = Date.parse(row.submittedAt);
    if (!Number.isNaN(start) && at < start) return false;
    if (!Number.isNaN(end) && at > end) return false;
    for (const [key, accepted] of Object.entries(filters ?? {})) {
      if (accepted.length === 0) continue;
      const got = valuesOf(row.values[key]);
      if (!got.some((v) => accepted.includes(v))) return false;
    }
    return true;
  });
}

function optionLabel(field: Field, value: string): string {
  if (value === "__other__" || value.startsWith("__other__:")) return "Autre";
  return field.options?.find((o) => o.value === value)?.label || value;
}

const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);

function numericSummary(numbers: number[]) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const mean = sorted.reduce((s, n) => s + n, 0) / sorted.length;
  const variance = sorted.reduce((s, n) => s + (n - mean) ** 2, 0) / sorted.length;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 100) / 100,
    median,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

/** Répartition d'une question sur un ensemble de réponses. */
export function questionStats(field: Field, rows: Row[], sampleSize = 20) {
  const raw = rows.map((r) => r.values[field.key]);
  const answered = raw.filter((v) => !isEmpty(v));
  const base = {
    key: field.key,
    label: field.label,
    type: field.type,
    responses: rows.length,
    answered: answered.length,
    skipped: rows.length - answered.length,
  };

  if (CHOICE_TYPES.has(field.type) || field.type === "checkbox") {
    const counts = new Map<string, number>();
    for (const o of field.options ?? []) counts.set(o.value, 0);
    let other = 0;
    const otherTexts: string[] = [];
    for (const v of answered) {
      for (const value of valuesOf(v)) {
        if (value === "__other__" || value.startsWith("__other__:")) {
          other += 1;
          const text = value.slice("__other__:".length).trim();
          if (text && otherTexts.length < sampleSize) otherTexts.push(text);
        } else {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
    }
    const distribution = [...counts].map(([value, count]) => ({
      value,
      label: optionLabel(field, value),
      count,
      // Choix multiple : part des répondants ayant coché, la somme dépasse 100 %.
      percent: pct(count, answered.length),
    }));
    if (other > 0) distribution.push({ value: "__other__", label: "Autre", count: other, percent: pct(other, answered.length) });
    return {
      ...base,
      multiple: field.type === "checkbox",
      distribution,
      ...(otherTexts.length ? { otherAnswers: otherTexts } : {}),
    };
  }

  if (field.type === "number" || field.type === "linear_scale") {
    const numbers = answered.map(Number).filter(Number.isFinite);
    const out: Record<string, unknown> = { ...base, summary: numericSummary(numbers) };
    if (field.type === "linear_scale") {
      const min = field.scale?.min ?? 1;
      const max = field.scale?.max ?? 5;
      const distribution = [];
      for (let n = min; n <= max; n += 1) {
        const count = numbers.filter((x) => x === n).length;
        distribution.push({ value: n, count, percent: pct(count, numbers.length) });
      }
      out.distribution = distribution;
      if (field.scale?.minLabel || field.scale?.maxLabel)
        out.scaleLabels = { min: field.scale.minLabel, max: field.scale.maxLabel };
    }
    return out;
  }

  if (field.type === "grid" || field.type === "checkbox_grid") {
    const rowsDef = field.grid?.rows ?? [];
    const cols = field.grid?.columns ?? [];
    const table = rowsDef.map((rowLabel) => {
      const counts = new Map(cols.map((c) => [c, 0]));
      let n = 0;
      for (const v of answered) {
        const cell = (v as Record<string, unknown>)?.[rowLabel];
        const picked = valuesOf(cell);
        if (picked.length) n += 1;
        for (const c of picked) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return {
        row: rowLabel,
        answered: n,
        columns: [...counts].map(([column, count]) => ({ column, count, percent: pct(count, n) })),
      };
    });
    return { ...base, grid: table };
  }

  if (field.type === "date" || field.type === "datetime") {
    const dates = answered.map(String).filter((s) => !Number.isNaN(Date.parse(s))).sort();
    return { ...base, earliest: dates[0] ?? null, latest: dates[dates.length - 1] ?? null };
  }

  if (["short_text", "paragraph", "email", "address"].includes(field.type)) {
    return { ...base, samples: answered.slice(0, sampleSize).map(String) };
  }

  // Fichiers, signatures, paiements : seule la présence d'une réponse compte.
  return base;
}

export function formStats(fields: Field[], rows: Row[], keys?: string[], sampleSize?: number) {
  return fields
    .filter((f) => !LAYOUT_TYPES.has(f.type))
    .filter((f) => !keys?.length || keys.includes(f.key))
    .map((f) => questionStats(f, rows, sampleSize));
}

export type CrossMode = "count" | "row" | "col" | "total";

/** Modalités d'une question pour un tableau croisé. */
function modalities(field: Field, rows: Row[]): { value: string; label: string }[] {
  if (field.options?.length) {
    const out = field.options.map((o) => ({ value: o.value, label: o.label || o.value }));
    const hasOther = rows.some((r) => valuesOf(r.values[field.key]).some((v) => v.startsWith("__other__")));
    if (hasOther) out.push({ value: "__other__", label: "Autre" });
    return out;
  }
  if (field.type === "linear_scale") {
    const out = [];
    for (let n = field.scale?.min ?? 1; n <= (field.scale?.max ?? 5); n += 1) out.push({ value: String(n), label: String(n) });
    return out;
  }
  const seen = new Set<string>();
  for (const r of rows) for (const v of valuesOf(r.values[field.key])) seen.add(v);
  return [...seen].sort().map((v) => ({ value: v, label: v }));
}

const normalize = (v: string) => (v.startsWith("__other__") ? "__other__" : v);

/** Tableau croisé de deux questions (les choix multiples comptent chaque case cochée). */
export function crossTab(rowField: Field, colField: Field, rows: Row[], mode: CrossMode) {
  const rMods = modalities(rowField, rows);
  const cMods = modalities(colField, rows);
  const counts = rMods.map(() => cMods.map(() => 0));
  let respondents = 0;

  for (const row of rows) {
    const rv = valuesOf(row.values[rowField.key]).map(normalize);
    const cv = valuesOf(row.values[colField.key]).map(normalize);
    if (!rv.length || !cv.length) continue;
    respondents += 1;
    for (const a of rv) {
      const i = rMods.findIndex((m) => m.value === a);
      if (i < 0) continue;
      for (const b of cv) {
        const j = cMods.findIndex((m) => m.value === b);
        if (j >= 0) counts[i]![j]! += 1;
      }
    }
  }

  const rowTotals = counts.map((r) => r.reduce((s, n) => s + n, 0));
  const colTotals = cMods.map((_, j) => counts.reduce((s, r) => s + r[j]!, 0));
  const total = rowTotals.reduce((s, n) => s + n, 0);

  const cell = (n: number, i: number, j: number) =>
    mode === "count" ? n : mode === "row" ? pct(n, rowTotals[i]!) : mode === "col" ? pct(n, colTotals[j]!) : pct(n, total);

  return {
    rows: { key: rowField.key, label: rowField.label },
    columns: { key: colField.key, label: colField.label },
    mode,
    unit: mode === "count" ? "réponses" : "%",
    respondents,
    columnLabels: cMods.map((m) => m.label),
    table: rMods.map((m, i) => ({
      label: m.label,
      values: Object.fromEntries(cMods.map((c, j) => [c.label, cell(counts[i]![j]!, i, j)])),
      total: rowTotals[i],
    })),
    columnTotals: Object.fromEntries(cMods.map((c, j) => [c.label, colTotals[j]])),
    total,
  };
}
