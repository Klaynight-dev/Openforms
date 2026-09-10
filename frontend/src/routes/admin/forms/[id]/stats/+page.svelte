<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { api } from "$api/client.ts";
  import { getResponsesCached } from "$lib/responsesCache.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type {
    FieldDefinition,
    ResponseRow,
    FormDetail,
    FormSummary,
    StatsPreset,
    StatsPresetConfig,
  } from "$lib/types.ts";

  import MultiSelectFilter from "$lib/components/MultiSelectFilter.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import ExportSettingsPanel from "$lib/components/ExportSettingsPanel.svelte";
  import ExportPreviewModal from "$lib/components/ExportPreviewModal.svelte";
  import DataExportMenu from "$lib/components/DataExportMenu.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { sanitizeFilename, type DataExportOptions, type DataFormat } from "$lib/dataExport.ts";
  import Segmented from "$lib/components/Segmented.svelte";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import {
    DEFAULT_EXPORT_THEME,
    heatRamp,
    normalizeExportTheme,
    rgba,
    shade,
    type ChartImageSource,
    type ExportTheme,
  } from "$lib/exportTheme.ts";
  import {
    IconBack,
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconTrend,
    IconTable,
    IconCheck,
    IconDownload,
    IconCheckboxGrid,
    IconFormula,
    IconReset,
  } from "$lib/icons.ts";
  // echarts chargé dynamiquement (grosse dépendance) : hors du bundle initial.
  import type { ECharts } from "echarts";
  let echarts: typeof import("echarts") | null = null;

  /** Un formulaire dont les réponses alimentent le tableau croisé. */
  type CrossSource = { id: string; title: string; schema: FieldDefinition[]; rows: ResponseRow[] };

  /** Dimension croisable : un champ d'une source, ou la source elle-même. */
  type CrossField = {
    key: string;
    label: string;
    /** `null` pour la dimension virtuelle « formulaire ». */
    field: FieldDefinition | null;
    formId: string;
  };

  const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  /** En deçà de ce pourcentage, une part de camembert ne porte pas d'étiquette. */
  const PIE_LABEL_MIN_PERCENT = 4;
  /** Nombre maximal d'étiquettes autour d'un camembert, les plus grosses parts d'abord. */
  const PIE_MAX_LABELS = 6;

  const formId = $derived($page.params.id as string);

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let formTitle = $state("");
  let schema = $state<FieldDefinition[]>([]);
  let rows = $state<ResponseRow[]>([]);
  let activity = $state<{ date: string; count: number }[]>([]);
  let formDetail = $state<FormDetail | null>(null);
  let canEdit = $state(false);

  // --- Identité visuelle des exports (DA) ---
  // Source de vérité unique : sert à l'habillage des PNG exportés *et* à la
  // palette des graphiques à l'écran, pour que l'aperçu corresponde au rendu.
  let exportTheme = $state<ExportTheme>({ ...DEFAULT_EXPORT_THEME });
  /** Sérialisation du dernier état persisté, pour détecter les modifications. */
  let savedThemeJson = $state(JSON.stringify(DEFAULT_EXPORT_THEME));
  let themeDirty = $derived(JSON.stringify(exportTheme) !== savedThemeJson);
  let savingTheme = $state(false);
  let exportPanelOpen = $state(false);

  let palette = $derived(exportTheme.palette);
  let accent = $derived(exportTheme.accentColor);

  /** Graphique en attente d'export ; non nul = modale d'aperçu ouverte. */
  let exportTarget = $state<{ chart: ChartImageSource; title: string; filename: string } | null>(
    null,
  );

  // Filtres additionnels : valeurs sélectionnées par champ à choix.
  let extraFilters = $state<Record<string, string[]>>({});
  let hasExtraFilters = $derived(Object.values(extraFilters).some((v) => v.length > 0));

  // ECharts instances
  let lineChartEl = $state<HTMLDivElement>();
  let lineChart: ECharts | null = null;
  let pieCharts: Record<string, ECharts> = {};
  let fillRateChartEl = $state<HTMLDivElement>();
  let fillRateChart: ECharts | null = null;
  let dayHourEl = $state<HTMLDivElement>();
  let dayHourChart: ECharts | null = null;
  let weekdayEl = $state<HTMLDivElement>();
  let weekdayChart: ECharts | null = null;
  let hourEl = $state<HTMLDivElement>();
  let hourChart: ECharts | null = null;
  let crossChartEl = $state<HTMLDivElement>();
  let crossChart: ECharts | null = null;
  let histCharts: Record<string, ECharts> = {};
  let gridCharts: Record<string, ECharts> = {};

  // Mode d'affichage de la courbe d'évolution
  let evolutionMode = $state<"daily" | "cumulative">("daily");

  // Tableau croisé : champs sélectionnés (un axe peut combiner plusieurs
  // champs) + mode d'affichage.
  let crossRowKeys = $state<string[]>([]);
  let crossColKeys = $state<string[]>([]);
  let crossMode = $state<"count" | "row" | "col" | "total">("count");

  // Sources croisées : formulaires supplémentaires confrontés au formulaire
  // courant. Toujours au moins le formulaire courant (implicite).
  let extraSourceIds = $state<string[]>([]);
  let availableForms = $state<FormSummary[]>([]);
  let extraSources = $state<Record<string, CrossSource>>({});
  let loadingSources = $state(false);

  // Date range filtering
  let filterStartDate = $state("");
  let filterEndDate = $state("");

  // Filtres numériques (champs `number` et `linear_scale`) : bornes incluses.
  let numericFilters = $state<Record<string, { min?: number; max?: number }>>({});
  let hasNumericFilters = $derived(
    Object.values(numericFilters).some((r) => r.min != null || r.max != null),
  );

  /** Met à jour une borne de filtre numérique (champ vide = borne retirée). */
  function setNumericBound(key: string, bound: "min" | "max", raw: string) {
    const current = { ...(numericFilters[key] ?? {}) };
    if (raw === "" || Number.isNaN(Number(raw))) delete current[bound];
    else current[bound] = Number(raw);
    if (current.min == null && current.max == null) {
      const { [key]: _removed, ...rest } = numericFilters;
      numericFilters = rest;
    } else {
      numericFilters = { ...numericFilters, [key]: current };
    }
  }

  /** Restreint un jeu de lignes à la plage de dates courante. */
  function applyDateFilter(data: ResponseRow[]): ResponseRow[] {
    if (!filterStartDate && !filterEndDate) return data;
    const start = filterStartDate ? new Date(filterStartDate).getTime() : 0;
    const end = filterEndDate ? new Date(filterEndDate).getTime() : Infinity;
    return data.filter((r) => {
      const t = new Date(r.submittedAt).getTime();
      return t >= start && t <= end;
    });
  }

  let filteredRows = $derived.by<ResponseRow[]>(() => {
    let data = applyDateFilter(rows);
    for (const [key, selected] of Object.entries(extraFilters)) {
      if (!selected || selected.length === 0) continue;
      data = data.filter((r) => {
        const v = r.values[key];
        const vals = Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [];
        return vals.some((x) => selected.includes(x));
      });
    }
    for (const [key, range] of Object.entries(numericFilters)) {
      if (range.min == null && range.max == null) continue;
      data = data.filter((r) => {
        const n = Number(r.values[key]);
        if (!Number.isFinite(n)) return false;
        return n >= (range.min ?? -Infinity) && n <= (range.max ?? Infinity);
      });
    }
    return data;
  });

  let filteredActivity = $derived.by<{ date: string; count: number }[]>(() => {
    const counts: Record<string, number> = {};
    if (rows.length === 0) return [];
    
    // Find min and max date from rows
    const dates = rows.map(r => new Date(r.submittedAt).getTime());
    let minDate = new Date(Math.min(...dates));
    let maxDate = new Date(Math.max(...dates));

    // If date filters are set, respect them
    if (filterStartDate) minDate = new Date(filterStartDate);
    if (filterEndDate) maxDate = new Date(filterEndDate);

    // Initialize buckets
    let current = new Date(minDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(maxDate);
    end.setHours(23, 59, 59, 999);

    // Limit infinite loops
    let safeCount = 0;
    while (current <= end && safeCount < 366) {
      const key = current.toISOString().slice(0, 10);
      counts[key] = 0;
      current.setDate(current.getDate() + 1);
      safeCount++;
    }

    for (const r of filteredRows) {
      const key = new Date(r.submittedAt).toISOString().slice(0, 10);
      if (counts[key] !== undefined) {
        counts[key] += 1;
      }
    }

    return Object.entries(counts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  });

  // ─── Computed analytics ─────────────────────────────────────────────
  let choiceFields = $derived(
    schema.filter((f) => ["radio", "select", "checkbox"].includes(f.type))
  );
  let numericFields = $derived(
    schema.filter((f) => ["number", "linear_scale"].includes(f.type))
  );
  let textFields = $derived(
    schema.filter((f) => ["short_text", "paragraph", "email"].includes(f.type))
  );

  function getChoiceDistribution(field: FieldDefinition): { value: string; label: string; count: number; color?: string }[] {
    const counts: Record<string, number> = {};
    for (const opt of field.options ?? []) counts[opt.value] = 0;
    for (const row of filteredRows) {
      const val = row.values[field.key];
      if (val == null) continue;
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals) {
        const key = String(v);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return Object.entries(counts).map(([v, count]) => {
      const opt = field.options?.find((o) => o.value === v);
      let label = opt?.label ?? v;
      if (label.startsWith("__other__:")) {
        label = label.slice("__other__:".length);
      } else if (label === "__other__") {
        label = "Autre";
      }
      return { value: v, label, count, color: opt?.color };
    }).sort((a, b) => b.count - a.count);
  }

  /** Valeurs numériques d'un champ (les vides sont exclus, pas convertis en 0). */
  function numericValues(field: FieldDefinition): number[] {
    return filteredRows
      .map((r) => r.values[field.key])
      .filter((v) => v != null && v !== "")
      .map(Number)
      .filter((v) => !isNaN(v));
  }

  // --- Édition de la couleur d'une option (persistée dans le schéma du formulaire) ---
  async function setOptionColor(field: FieldDefinition, optionValue: string, color: string) {
    const opt = field.options?.find((o) => o.value === optionValue);
    if (!opt) return;
    opt.color = color;
    schema = [...schema];
    const el = pieCharts[field.key]?.getDom() as HTMLDivElement | undefined;
    if (el) renderPieChart(el, field);
    try {
      await persistSchema(schema);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Impossible d'enregistrer la couleur.");
    }
  }

  async function persistSchema(updatedSchema: FieldDefinition[]) {
    if (!formDetail) return;
    await api.updateForm(formId, {
      title: formDetail.title,
      description: formDetail.description ?? undefined,
      schema: updatedSchema,
      metaColumns: formDetail.metaColumns,
      requireConsent: formDetail.requireConsent,
      consentText: formDetail.consentText ?? undefined,
      isAnonymized: formDetail.isAnonymized,
      encryptResponses: formDetail.encryptResponses,
      visibility: formDetail.visibility,
      allowedEmails: formDetail.allowedEmails,
      notifyOwner: formDetail.notifyOwner,
      sendConfirmationEmail: formDetail.sendConfirmationEmail,
      confirmationEmailText: formDetail.confirmationEmailText ?? undefined,
      webhookUrl: formDetail.webhookUrl ?? undefined,
      startsAt: formDetail.startsAt ?? undefined,
      endsAt: formDetail.endsAt ?? undefined,
      maxResponses: formDetail.maxResponses ?? undefined,
      translations: formDetail.translations,
    });
  }

  /** Quantile par interpolation linéaire sur un tableau trié. */
  function quantile(sorted: number[], q: number): number {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  function getNumericStats(field: FieldDefinition) {
    const vals = numericValues(field);
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const variance = vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length;
    return {
      count: vals.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      sum: round2(sum),
      avg: round2(avg),
      median: round2(quantile(sorted, 0.5)),
      q1: round2(quantile(sorted, 0.25)),
      q3: round2(quantile(sorted, 0.75)),
      stdDev: round2(Math.sqrt(variance)),
    };
  }

  /** Histogramme auto-binné d'un champ numérique (1 barre par échelon pour les échelles). */
  function getHistogram(field: FieldDefinition): { labels: string[]; counts: number[] } | null {
    const vals = numericValues(field);
    if (vals.length === 0) return null;
    if (field.type === "linear_scale") {
      const min = field.scale?.min ?? 1;
      const max = field.scale?.max ?? 5;
      const labels: string[] = [];
      const counts: number[] = [];
      for (let i = min; i <= max; i++) {
        labels.push(String(i));
        counts.push(vals.filter((v) => v === i).length);
      }
      return { labels, counts };
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return { labels: [String(min)], counts: [vals.length] };
    const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(vals.length))));
    const width = (max - min) / binCount;
    const counts = Array(binCount).fill(0);
    for (const v of vals) {
      counts[Math.min(binCount - 1, Math.floor((v - min) / width))]++;
    }
    const fmt = (n: number) => String(Math.round(n * 10) / 10);
    const labels = counts.map((_, i) => `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`);
    return { labels, counts };
  }

  /** Corrélation de Pearson entre deux champs numériques (paires complètes uniquement). */
  function pearson(a: FieldDefinition, b: FieldDefinition): { r: number; n: number } | null {
    const pairs: [number, number][] = [];
    for (const row of filteredRows) {
      const va = row.values[a.key];
      const vb = row.values[b.key];
      if (va == null || va === "" || vb == null || vb === "") continue;
      const na = Number(va);
      const nb = Number(vb);
      if (isNaN(na) || isNaN(nb)) continue;
      pairs.push([na, nb]);
    }
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const ma = pairs.reduce((s, p) => s + p[0], 0) / n;
    const mb = pairs.reduce((s, p) => s + p[1], 0) / n;
    let num = 0, da = 0, db = 0;
    for (const [x, y] of pairs) {
      num += (x - ma) * (y - mb);
      da += (x - ma) ** 2;
      db += (y - mb) ** 2;
    }
    if (da === 0 || db === 0) return null;
    return { r: num / Math.sqrt(da * db), n };
  }

  function getWordCloud(fields: FieldDefinition[]): { word: string; count: number }[] {
    const freq: Record<string, number> = {};
    const stopWords = new Set([
      "le","la","les","de","du","des","un","une","et","en","à","au","aux",
      "je","il","elle","ils","elles","nous","vous","on","qui","que","quoi",
      "dans","par","sur","sous","avec","pour","pas","ne","se","si","est",
      "sont","été","avoir","être","the","a","an","and","or","in","of","to",
      "is","it","this","that","was","are","for","with","as","at","be","by",
    ]);
    for (const field of fields) {
      for (const row of filteredRows) {
        const val = row.values[field.key];
        if (!val) continue;
        const words = String(val)
          .toLowerCase()
          .replace(/[^a-zàâçéèêëîïôùûüÿœæ\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stopWords.has(w));
        for (const w of words) {
          freq[w] = (freq[w] ?? 0) + 1;
        }
      }
    }
    return Object.entries(freq)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  }

  function getFillRate(field: FieldDefinition): number {
    if (filteredRows.length === 0) return 0;
    const filled = filteredRows.filter((r) => {
      const v = r.values[field.key];
      return v !== null && v !== undefined && v !== "";
    }).length;
    return Math.round((filled / filteredRows.length) * 100);
  }

  let wordCloud = $derived(getWordCloud(textFields));
  let fillRates = $derived(schema.map((f) => ({ label: f.label, rate: getFillRate(f) })));

  // ─── Analyse temporelle croisée ─────────────────────────────────────
  /** Matrice 7 jours × 24 heures des soumissions (lundi = ligne 0). */
  let dayHourMatrix = $derived.by<number[][]>(() => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of filteredRows) {
      const d = new Date(r.submittedAt);
      matrix[(d.getDay() + 6) % 7][d.getHours()]++;
    }
    return matrix;
  });

  let weekdayDist = $derived(dayHourMatrix.map((row) => row.reduce((a, b) => a + b, 0)));
  let hourDist = $derived(
    Array.from({ length: 24 }, (_, h) => dayHourMatrix.reduce((s, row) => s + row[h], 0))
  );

  let peakDay = $derived.by(() => {
    let best: { date: string; count: number } | null = null;
    for (const a of filteredActivity) {
      if (a.count > 0 && (!best || a.count > best.count)) best = a;
    }
    return best;
  });

  let peakHour = $derived.by(() => {
    const max = Math.max(...hourDist);
    if (max === 0) return null;
    return { hour: hourDist.indexOf(max), count: max };
  });

  let avgPerActiveDay = $derived.by(() => {
    const activeDays = filteredActivity.filter((a) => a.count > 0).length;
    if (activeDays === 0) return 0;
    return Math.round((filteredRows.length / activeDays) * 10) / 10;
  });

  /** % de réponses où tous les champs obligatoires sont remplis. */
  let completionRate = $derived.by(() => {
    const required = schema.filter((f) => f.required && f.type !== "section");
    if (required.length === 0 || filteredRows.length === 0) return null;
    const complete = filteredRows.filter((r) =>
      required.every((f) => {
        const v = r.values[f.key];
        return v != null && v !== "" && (!Array.isArray(v) || v.length > 0);
      })
    ).length;
    return Math.round((complete / filteredRows.length) * 100);
  });

  // ─── Tableau croisé dynamique ───────────────────────────────────────
  const CROSSABLE_TYPES = ["radio", "select", "checkbox", "linear_scale"];
  /** Dimension virtuelle : la source (formulaire) d'où provient la réponse. */
  const FORM_DIM_KEY = "__form__";
  /** Sépare les valeurs d'un axe combinant plusieurs champs. */
  const AXIS_SEP = "\u001F";

  /** Sources effectivement croisées : le formulaire courant, puis les autres. */
  let crossSources = $derived.by<CrossSource[]>(() => {
    const own: CrossSource = { id: formId, title: formTitle, schema, rows: filteredRows };
    const others = extraSourceIds
      .filter((id) => id !== formId)
      .map((id) => extraSources[id])
      .filter((s): s is CrossSource => Boolean(s))
      // Les filtres à choix visent les champs du formulaire courant : seules
      // les bornes de dates, universelles, s'appliquent aux autres sources.
      .map((s) => ({ ...s, rows: applyDateFilter(s.rows) }));
    return [own, ...others];
  });

  let isMultiSource = $derived(crossSources.length > 1);

  /** Champs croisables, préfixés par leur source dès qu'il y en a plusieurs. */
  let crossFields = $derived.by<CrossField[]>(() => {
    const out: CrossField[] = [];
    if (isMultiSource) {
      out.push({ key: FORM_DIM_KEY, label: "Formulaire (source)", field: null, formId: "" });
    }
    for (const src of crossSources) {
      for (const f of src.schema) {
        if (!CROSSABLE_TYPES.includes(f.type)) continue;
        out.push({
          key: isMultiSource ? `${src.id}::${f.key}` : f.key,
          label: isMultiSource ? `${src.title}- ${f.label}` : f.label,
          field: f,
          formId: src.id,
        });
      }
    }
    return out;
  });

  $effect(() => {
    if (crossFields.length >= 2 && crossRowKeys.length === 0 && crossColKeys.length === 0) {
      crossRowKeys = [crossFields[0].key];
      crossColKeys = [crossFields[1].key];
    }
  });

  /** Charge les réponses des sources supplémentaires sélectionnées. */
  $effect(() => {
    const ids = extraSourceIds;
    const missing = untrack(() => ids.filter((id) => id !== formId && !extraSources[id]));
    if (missing.length === 0) return;

    loadingSources = true;
    Promise.all(
      missing.map(async (id) => {
        const res = await getResponsesCached(id);
        return [
          id,
          {
            id,
            title: res.form.title,
            schema: res.form.schema as FieldDefinition[],
            rows: res.rows,
          },
        ] as const;
      }),
    )
      .then((entries) => {
        for (const [id, src] of entries) extraSources[id] = src;
      })
      .catch(() => toasts.error("Impossible de charger une des sources croisées."))
      .finally(() => (loadingSources = false));
  });

  /** Valeurs d'un champ croisable normalisées en tableau ("Autre" regroupé). */
  function extractChoiceValues(row: ResponseRow, field: FieldDefinition): string[] {
    const val = row.values[field.key];
    if (val == null || val === "") return [];
    const arr = Array.isArray(val) ? val : [val];
    return arr
      .map((v) => (String(v).startsWith("__other__") ? "__other__" : String(v)))
      .filter((s) => s !== "");
  }

  /** Catégories (valeur + libellé) d'un champ croisable, dans l'ordre défini. */
  function choiceCategories(field: FieldDefinition): { value: string; label: string }[] {
    if (field.type === "linear_scale") {
      const min = field.scale?.min ?? 1;
      const max = field.scale?.max ?? 5;
      return Array.from({ length: max - min + 1 }, (_, i) => ({
        value: String(min + i),
        label: String(min + i),
      }));
    }
    const cats = (field.options ?? []).map((o) => ({ value: o.value, label: o.label }));
    if (field.allowOther) cats.push({ value: "__other__", label: "Autre" });
    return cats;
  }

  /** Catégories d'une dimension croisable (champ réel ou source). */
  function crossCategories(cf: CrossField): { value: string; label: string }[] {
    if (cf.key === FORM_DIM_KEY) return crossSources.map((s) => ({ value: s.id, label: s.title }));
    return choiceCategories(cf.field!);
  }

  /** Valeurs prises par une dimension pour une ligne donnée d'une source donnée. */
  function crossValues(row: ResponseRow, srcId: string, cf: CrossField): string[] {
    if (cf.key === FORM_DIM_KEY) return [srcId];
    // Un champ appartient à une source : les lignes des autres n'y répondent pas.
    if (cf.formId !== srcId) return [];
    return extractChoiceValues(row, cf.field!);
  }

  /**
   * Clés d'axe d'une ligne : produit cartésien des valeurs de chaque champ de
   * l'axe (un champ à choix multiples produit plusieurs combinaisons). Une
   * ligne qui ne renseigne pas tous les champs de l'axe est exclue.
   */
  function axisKeys(row: ResponseRow, srcId: string, fields: CrossField[]): string[] {
    let combos: string[][] = [[]];
    for (const cf of fields) {
      const vals = crossValues(row, srcId, cf);
      if (vals.length === 0) return [];
      combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
    }
    return combos.map((c) => c.join(AXIS_SEP));
  }

  /** Libellé lisible d'une clé d'axe composite. */
  function axisLabel(key: string, fields: CrossField[]): string {
    return key
      .split(AXIS_SEP)
      .map((v, i) => crossCategories(fields[i]).find((c) => c.value === v)?.label ?? v)
      .join(" / ");
  }

  /** Rang d'une clé d'axe, pour retrouver l'ordre déclaré des options. */
  function axisRank(key: string, fields: CrossField[]): number[] {
    return key.split(AXIS_SEP).map((v, i) => {
      const idx = crossCategories(fields[i]).findIndex((c) => c.value === v);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    });
  }

  let crossTab = $derived.by(() => {
    const resolve = (keys: string[]) =>
      keys.map((k) => crossFields.find((f) => f.key === k)).filter((f): f is CrossField => Boolean(f));
    const rowFields = resolve(crossRowKeys);
    const colFields = resolve(crossColKeys);
    if (rowFields.length === 0 || colFields.length === 0) return null;
    // Un même champ ne peut pas figurer sur les deux axes.
    if (rowFields.some((r) => colFields.some((c) => c.key === r.key))) return null;

    const counts = new Map<string, Map<string, number>>();
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();
    let paired = 0;

    for (const src of crossSources) {
      for (const row of src.rows) {
        const rks = axisKeys(row, src.id, rowFields);
        const cks = axisKeys(row, src.id, colFields);
        if (rks.length === 0 || cks.length === 0) continue;
        paired++;
        for (const rk of rks) {
          rowKeys.add(rk);
          let line = counts.get(rk);
          if (!line) { line = new Map(); counts.set(rk, line); }
          for (const ck of cks) {
            colKeys.add(ck);
            line.set(ck, (line.get(ck) ?? 0) + 1);
          }
        }
      }
    }

    const byRank = (fields: CrossField[]) => (a: string, b: string) => {
      const ra = axisRank(a, fields);
      const rb = axisRank(b, fields);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      }
      return a.localeCompare(b);
    };

    const orderedRows = [...rowKeys].sort(byRank(rowFields));
    const orderedCols = [...colKeys].sort(byRank(colFields));
    const rowCats = orderedRows.map((k) => ({ value: k, label: axisLabel(k, rowFields) }));
    const colCats = orderedCols.map((k) => ({ value: k, label: axisLabel(k, colFields) }));
    const matrix = orderedRows.map((rk) => orderedCols.map((ck) => counts.get(rk)?.get(ck) ?? 0));

    const rowTotals = matrix.map((r) => r.reduce((a, b) => a + b, 0));
    const colTotals = orderedCols.map((_, ci) => matrix.reduce((s, r) => s + r[ci], 0));
    const grand = rowTotals.reduce((a, b) => a + b, 0);
    const maxCell = Math.max(0, ...matrix.flat());
    const rowLabel = rowFields.map((f) => f.label).join(" / ");
    const colLabel = colFields.map((f) => f.label).join(" / ");
    return { rowFields, colFields, rowLabel, colLabel, rowCats, colCats, matrix, rowTotals, colTotals, grand, maxCell, paired };
  });

  function crossCellText(count: number, ri: number, ci: number): string {
    if (!crossTab) return "";
    switch (crossMode) {
      case "count": return String(count);
      case "row": return crossTab.rowTotals[ri] ? Math.round((count / crossTab.rowTotals[ri]) * 100) + " %" : "—";
      case "col": return crossTab.colTotals[ci] ? Math.round((count / crossTab.colTotals[ci]) * 100) + " %" : "—";
      case "total": return crossTab.grand ? Math.round((count / crossTab.grand) * 100) + " %" : "—";
    }
  }

  // ─── Presets de croisement ──────────────────────────────────────────
  let presets = $state<StatsPreset[]>([]);
  let activePresetId = $state("");
  let presetModalOpen = $state(false);
  let presetName = $state("");
  let savingPreset = $state(false);

  /** Photographie de la configuration courante, telle qu'elle sera persistée. */
  function currentPresetConfig(): StatsPresetConfig {
    const filters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(extraFilters)) {
      if (v && v.length > 0) filters[k] = [...v];
    }
    const numeric: Record<string, { min?: number; max?: number }> = {};
    for (const [k, r] of Object.entries(numericFilters)) {
      if (r.min != null || r.max != null) numeric[k] = { ...r };
    }
    return {
      rowFields: [...crossRowKeys],
      colFields: [...crossColKeys],
      crossMode,
      extraFilters: filters,
      numericFilters: numeric,
      ...(filterStartDate ? { dateStart: filterStartDate } : {}),
      ...(filterEndDate ? { dateEnd: filterEndDate } : {}),
    };
  }

  /** Restaure intégralement une configuration enregistrée. */
  function applyPreset(preset: StatsPreset) {
    activePresetId = preset.id;
    extraSourceIds = preset.formIds.filter((id) => id !== formId);
    crossRowKeys = [...preset.config.rowFields];
    crossColKeys = [...preset.config.colFields];
    crossMode = preset.config.crossMode;
    extraFilters = { ...preset.config.extraFilters };
    numericFilters = { ...preset.config.numericFilters };
    filterStartDate = preset.config.dateStart ?? "";
    filterEndDate = preset.config.dateEnd ?? "";
  }

  async function loadPresets() {
    try {
      const res = await api.listStatsPresets(formId);
      presets = res.presets;
    } catch {
      // Un preset indisponible ne doit pas empêcher la page de fonctionner.
    }
  }

  async function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    savingPreset = true;
    try {
      const res = await api.createStatsPreset({
        name,
        formIds: [formId, ...extraSourceIds.filter((id) => id !== formId)],
        config: currentPresetConfig(),
      });
      presets = [res.preset, ...presets];
      activePresetId = res.preset.id;
      presetModalOpen = false;
      presetName = "";
      toasts.success("Preset enregistré.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de l'enregistrement du preset.");
    } finally {
      savingPreset = false;
    }
  }

  /** Écrase le preset actif avec la configuration affichée. */
  async function updateActivePreset() {
    const target = presets.find((p) => p.id === activePresetId);
    if (!target) return;
    savingPreset = true;
    try {
      const res = await api.updateStatsPreset(target.id, {
        formIds: [formId, ...extraSourceIds.filter((id) => id !== formId)],
        config: currentPresetConfig(),
      });
      presets = presets.map((p) => (p.id === res.preset.id ? res.preset : p));
      toasts.success("Preset mis à jour.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la mise à jour du preset.");
    } finally {
      savingPreset = false;
    }
  }

  async function deleteActivePreset() {
    const target = presets.find((p) => p.id === activePresetId);
    if (!target) return;
    try {
      await api.deleteStatsPreset(target.id);
      presets = presets.filter((p) => p.id !== target.id);
      activePresetId = "";
      toasts.success("Preset supprimé.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la suppression du preset.");
    }
  }

  /** Même calcul que crossCellText, mais matrice numérique pour le heatmap ECharts. */
  let crossDisplayMatrix = $derived.by(() => {
    if (!crossTab) return null;
    const { matrix, rowTotals, colTotals, grand } = crossTab;
    if (crossMode === "count") return matrix;
    return matrix.map((row, ri) =>
      row.map((count, ci) => {
        const total = crossMode === "row" ? rowTotals[ri] : crossMode === "col" ? colTotals[ci] : grand;
        return total ? Math.round((count / total) * 100) : 0;
      })
    );
  });

  // ─── Grilles (grid / checkbox_grid) ─────────────────────────────────
  let gridFields = $derived(
    schema.filter((f) => (f.type === "grid" || f.type === "checkbox_grid") && f.grid)
  );

  function getGridMatrix(field: FieldDefinition): number[][] {
    const gRows = field.grid?.rows ?? [];
    const gCols = field.grid?.columns ?? [];
    const matrix = gRows.map(() => gCols.map(() => 0));
    for (const row of filteredRows) {
      const val = row.values[field.key];
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      gRows.forEach((r, ri) => {
        const cell = (val as Record<string, unknown>)[r];
        if (cell == null) return;
        const selected = Array.isArray(cell) ? cell.map(String) : [String(cell)];
        gCols.forEach((c, ci) => {
          if (selected.includes(c)) matrix[ri][ci]++;
        });
      });
    }
    return matrix;
  }

  // ─── Corrélations entre champs numériques ───────────────────────────
  let correlations = $derived.by(() => {
    if (numericFields.length < 2) return [];
    const out: { a: FieldDefinition; b: FieldDefinition; r: number; n: number }[] = [];
    for (let i = 0; i < numericFields.length; i++) {
      for (let j = i + 1; j < numericFields.length; j++) {
        const res = pearson(numericFields[i], numericFields[j]);
        if (res) out.push({ a: numericFields[i], b: numericFields[j], ...res });
      }
    }
    return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  });

  // ─── Data loading ────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const [statsRes, responseRes, formRes, echartsMod] = await Promise.all([
        api.getFormStatsSummary(formId),
        getResponsesCached(formId),
        api.getForm(formId).catch(() => null),
        import("echarts"),
      ]);
      echarts = echartsMod;
      formTitle = statsRes.summary.title;
      activity = statsRes.summary.activity;
      schema = responseRes.form.schema as FieldDefinition[];
      rows = responseRes.rows;
      canEdit = responseRes.permission === "WRITE";
      formDetail = formRes?.form ?? null;
      exportTheme = normalizeExportTheme(formRes?.form?.exportTheme);
      savedThemeJson = JSON.stringify(exportTheme);

      // Sources croisables : les autres formulaires de la même organisation.
      // Chargées à part- leur absence ne doit pas casser la page.
      const orgId = formRes?.form?.organizationId ?? null;
      api
        .listForms()
        .then((res) => {
          availableForms = res.forms.filter(
            (f) => f.id !== formId && (orgId ? f.organizationId === orgId : false),
          );
        })
        .catch(() => {});
      loadPresets();
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur de chargement.";
    } finally {
      loading = false;
    }

    // Render charts after data is loaded
    await new Promise((r) => setTimeout(r, 50));
    renderLineChart();
    renderFillRateChart();
  });

  onDestroy(() => {
    lineChart?.dispose();
    fillRateChart?.dispose();
    dayHourChart?.dispose();
    weekdayChart?.dispose();
    hourChart?.dispose();
    crossChart?.dispose();
    Object.values(pieCharts).forEach((c) => c.dispose());
    Object.values(histCharts).forEach((c) => c.dispose());
    Object.values(gridCharts).forEach((c) => c.dispose());
  });

  // --- ECharts rendering & Redrawing ---
  // Chaque effet annule son propre timer en attente avant d'en reprogrammer un
  // (cleanup de $effect) : sans ça, des changements de filtre rapprochés
  // empilaient plusieurs passes de rendu de TOUS les graphiques en parallèle.
  $effect(() => {
    // `palette` et `accent` sont lus explicitement : un changement de DA doit
    // redessiner tous les graphiques, pas seulement les futurs exports.
    void palette;
    void accent;
    if (filteredRows && evolutionMode && !loading) {
      // Delay slightly to allow DOM updates
      const timer = setTimeout(() => {
        renderLineChart();
        renderFillRateChart();
        renderDayHourChart();
        renderWeekdayChart();
        renderHourChart();
        choiceFields.forEach((field) => {
          const el = pieCharts[field.key]?.getDom() as HTMLDivElement | undefined;
          if (el) renderPieChart(el, field);
        });
        numericFields.forEach((field) => {
          const el = histCharts[field.key]?.getDom() as HTMLDivElement | undefined;
          if (el) renderHistChart(el, field);
        });
        gridFields.forEach((field) => {
          const el = gridCharts[field.key]?.getDom() as HTMLDivElement | undefined;
          if (el) renderGridChart(el, field);
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  });

  // Le tableau croisé dépend aussi des champs choisis : effet dédié
  $effect(() => {
    void accent;
    void crossMode;
    if (crossTab && crossChartEl && !loading) {
      const timer = setTimeout(renderCrossChart, 50);
      return () => clearTimeout(timer);
    }
  });

  function renderLineChart() {
    if (!echarts || !lineChartEl) return;
    if (!lineChart) {
      lineChart = echarts.init(lineChartEl, null, { renderer: "canvas" });
    }
    const dates = filteredActivity.map((a) => {
      const d = new Date(a.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    let counts = filteredActivity.map((a) => a.count);
    if (evolutionMode === "cumulative") {
      let acc = 0;
      counts = counts.map((c) => (acc += c));
    }
    lineChart.setOption({
      tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} réponse(s)</b>` },
      grid: { left: 12, right: 12, top: 12, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: dates, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false }, axisLabel: { color: "#94a3b8", fontSize: 11 } },
      yAxis: { type: "value", minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: "#f1f5f9" } }, axisLabel: { color: "#94a3b8", fontSize: 11 } },
      series: [{
        type: "line",
        data: counts,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: accent, width: 2.5 },
        itemStyle: { color: accent, borderColor: "#fff", borderWidth: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: rgba(accent, 0.25) }, { offset: 1, color: rgba(accent, 0) }]) },
      }],
    });
  }

  function renderPieChart(el: HTMLDivElement, field: FieldDefinition) {
    const dist = getChoiceDistribution(field);
    const total = dist.reduce((s, d) => s + d.count, 0);
    if (!echarts || !el) return;
    
    let chart = pieCharts[field.key];
    if (!chart) {
      chart = echarts.init(el, null, { renderer: "canvas" });
      pieCharts[field.key] = chart;
    }

    if (total === 0) {
      chart.clear();
      return;
    }

    // Un camembert sans étiquette n'est lisible qu'au survol : l'information
    // disparaît à l'export et pour qui n'a pas de souris. On sort donc le
    // libellé et l'effectif au bout d'une ligne de rappel.
    const unite = field.type === "checkbox" ? "occurrences" : "réponses";
    // Effectif de la PIE_MAX_LABELS-ième part : sert de seuil pour ne garder
    // que les plus grosses (voir plus bas).
    const labelCutoff =
      [...dist].sort((a, b) => b.count - a.count)[PIE_MAX_LABELS - 1]?.count ?? 0;

    chart.setOption(
      {
        tooltip: { trigger: "item", formatter: "{b}<br/><b>{c}</b> ({d}%)" },
        legend: { show: false },
        // Total au centre du donut : l'espace est libre et c'est le premier
        // chiffre que l'on cherche.
        title: {
          text: String(total),
          subtext: unite,
          left: "center",
          top: "center",
          textAlign: "center",
          textStyle: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
          subtextStyle: { fontSize: 9, color: "#94a3b8" },
          itemGap: 0,
        },
        series: [
          {
            type: "pie",
            radius: ["40%", "54%"],
            center: ["50%", "50%"],
            avoidLabelOverlap: true,
            minAngle: 2,
            data: dist.map((d, i) => {
              const percent = total > 0 ? (d.count / total) * 100 : 0;
              // Deux conditions cumulées : une part trop fine ne peut pas
              // porter d'étiquette sans chevaucher sa voisine, et au-delà de
              // PIE_MAX_LABELS elles s'empilent quelle que soit leur taille.
              // Les parts écartées restent lisibles dans la liste en dessous.
              const labelled = percent >= PIE_LABEL_MIN_PERCENT && d.count >= labelCutoff;
              return {
                name: d.label,
                value: d.count,
                itemStyle: { color: d.color ?? palette[i % palette.length] },
                label: { show: labelled },
                labelLine: { show: labelled },
              };
            }),
            label: {
              position: "outside",
              // `alignTo: "edge"` colle l'étiquette au bord du canvas au lieu de
              // la laisser s'échapper au bout de sa ligne de rappel. Le texte
              // est coupé ici, à la main : `overflow: "truncate"` du texte
              // enrichi n'a pas d'effet sur un libellé de camembert, ECharts
              // déplaçant l'étiquette plutôt que de la rogner. Le libellé
              // complet reste dans la liste et dans l'infobulle.
              alignTo: "edge",
              edgeDistance: 4,
              // Pourcentage arrondi : « 180 (19.96%) » dépasse la place laissée
              // à 3 h et 9 h, où la ligne de rappel est la plus courte.
              // L'infobulle garde la valeur exacte.
              formatter: (p: any) => `{n|${ellipsize(p.name, 24)}}
{v|${p.value} (${Math.round(p.percent)} %)}`,
              rich: {
                n: { fontSize: 11, fontWeight: "bold", color: "#1e293b", lineHeight: 15 },
                v: { fontSize: 10, color: "#64748b", lineHeight: 13 },
              },
            },
            labelLine: { length: 10, length2: 8, smooth: true, lineStyle: { color: "#cbd5e1" } },
            emphasis: {
              scaleSize: 6,
              label: { show: true, fontWeight: "bold" },
              labelLine: { show: true },
            },
          },
        ],
      },
      // notMerge : sans ça, les `label.show` par donnée d'un rendu précédent
      // survivent à un changement de filtre qui modifie la répartition.
      true,
    );
  }

  /** Coupe un libellé trop long pour la place disponible, sur une limite de mot. */
  function ellipsize(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut.trimEnd()) + "…";
  }

  /** Met en avant la part correspondante quand on survole la liste. */
  function highlightSlice(fieldKey: string, dataIndex: number, on: boolean) {
    pieCharts[fieldKey]?.dispatchAction({
      type: on ? "highlight" : "downplay",
      seriesIndex: 0,
      dataIndex,
    });
  }

  function renderFillRateChart() {
    if (!echarts || !fillRateChartEl || fillRates.length === 0) return;
    if (!fillRateChart) {
      fillRateChart = echarts.init(fillRateChartEl, null, { renderer: "canvas" });
    }
    const sorted = [...fillRates].sort((a, b) => b.rate - a.rate);
    fillRateChart.setOption({
      tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value}%</b>` },
      grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", color: "#94a3b8", fontSize: 11 }, splitLine: { lineStyle: { color: "#f1f5f9" } } },
      yAxis: { type: "category", data: sorted.map((f) => f.label.length > 22 ? f.label.slice(0, 22) + "…" : f.label), axisLabel: { color: "#475569", fontSize: 11 }, axisTick: { show: false } },
      series: [{
        type: "bar",
        data: sorted.map((f) => ({
          value: f.rate,
          itemStyle: { color: f.rate >= 75 ? "#22c55e" : f.rate >= 40 ? "#f59e0b" : "#ef4444", borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
        label: { show: true, position: "right", fontSize: 10, color: "#475569", formatter: "{c} %" },
      }],
    });
  }

  /** Options ECharts communes aux heatmaps (rampe dérivée de la couleur d'accent). */
  function heatmapOption(rowLabels: string[], colLabels: string[], matrix: number[][], unit: "count" | "percent" = "count") {
    const maxVal = Math.max(1, ...matrix.flat());
    const suffix = unit === "percent" ? " %" : " réponse(s)";
    // ECharts trace l'axe Y de bas en haut : on inverse pour lire de haut en bas
    const data: [number, number, number][] = [];
    matrix.forEach((row, ri) => {
      row.forEach((v, ci) => data.push([ci, rowLabels.length - 1 - ri, v]));
    });
    return {
      tooltip: {
        formatter: (p: any) =>
          `${rowLabels[rowLabels.length - 1 - p.value[1]]} × ${colLabels[p.value[0]]}<br/><b>${p.value[2]}${suffix}</b>`,
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: colLabels, axisTick: { show: false }, axisLabel: { color: "#94a3b8", fontSize: 10 }, splitArea: { show: true } },
      yAxis: { type: "category", data: [...rowLabels].reverse(), axisTick: { show: false }, axisLabel: { color: "#475569", fontSize: 11 }, splitArea: { show: true } },
      visualMap: { show: false, min: 0, max: maxVal, inRange: { color: heatRamp(accent) } },
      series: [{
        type: "heatmap",
        data,
        label: { show: true, fontSize: 10, color: "#334155", formatter: (p: any) => (p.value[2] > 0 ? p.value[2] + (unit === "percent" ? " %" : "") : "") },
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
      }],
    };
  }

  /** Options ECharts communes aux barres simples (couleur d'accent). */
  function barOption(labels: string[], counts: number[], xLabelInterval: number | "auto" = "auto") {
    return {
      tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} réponse(s)</b>` },
      grid: { left: 8, right: 8, top: 22, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisLabel: { color: "#94a3b8", fontSize: 10, interval: xLabelInterval } },
      yAxis: { type: "value", minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: "#f1f5f9" } }, axisLabel: { color: "#94a3b8", fontSize: 10 } },
      series: [{
        type: "bar",
        data: counts,
        itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 22,
        // Valeur au-dessus de la barre : à l'export, le survol n'existe plus.
        // Au-delà d'une quinzaine de barres les étiquettes se chevauchent,
        // l'axe suffit alors à situer les ordres de grandeur.
        label: {
          show: counts.length <= 14,
          position: "top",
          fontSize: 10,
          color: "#475569",
          formatter: (p: any) => (p.value > 0 ? p.value : ""),
        },
      }],
    };
  }

  function renderDayHourChart() {
    if (!echarts || !dayHourEl) return;
    if (!dayHourChart) dayHourChart = echarts.init(dayHourEl, null, { renderer: "canvas" });
    const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
    dayHourChart.setOption(heatmapOption(WEEKDAYS, hours, dayHourMatrix));
  }

  function renderWeekdayChart() {
    if (!echarts || !weekdayEl) return;
    if (!weekdayChart) weekdayChart = echarts.init(weekdayEl, null, { renderer: "canvas" });
    weekdayChart.setOption(barOption(WEEKDAYS, weekdayDist, 0));
  }

  function renderHourChart() {
    if (!echarts || !hourEl) return;
    if (!hourChart) hourChart = echarts.init(hourEl, null, { renderer: "canvas" });
    hourChart.setOption(barOption(Array.from({ length: 24 }, (_, h) => `${h}h`), hourDist, 1));
  }

  function renderCrossChart() {
    if (!echarts || !crossChartEl || !crossTab || !crossDisplayMatrix) return;
    // Le conteneur est démonté/remonté selon la sélection : réinitialiser si le DOM a changé
    if (crossChart && crossChart.getDom() !== crossChartEl) {
      crossChart.dispose();
      crossChart = null;
    }
    if (!crossChart) crossChart = echarts.init(crossChartEl, null, { renderer: "canvas" });
    crossChart.setOption(
      heatmapOption(
        crossTab.rowCats.map((c) => c.label),
        crossTab.colCats.map((c) => c.label),
        crossDisplayMatrix,
        crossMode === "count" ? "count" : "percent"
      ),
      true
    );
    // Le nombre de lignes (donc la hauteur du conteneur) peut changer avec le champ choisi
    crossChart.resize();
  }

  function renderHistChart(el: HTMLDivElement, field: FieldDefinition) {
    if (!echarts || !el) return;
    let chart = histCharts[field.key];
    if (!chart) {
      chart = echarts.init(el, null, { renderer: "canvas" });
      histCharts[field.key] = chart;
    }
    const hist = getHistogram(field);
    if (!hist) {
      chart.clear();
      return;
    }
    chart.setOption(barOption(hist.labels, hist.counts));
  }

  function renderGridChart(el: HTMLDivElement, field: FieldDefinition) {
    if (!echarts || !el) return;
    let chart = gridCharts[field.key];
    if (!chart) {
      chart = echarts.init(el, null, { renderer: "canvas" });
      gridCharts[field.key] = chart;
    }
    chart.setOption(heatmapOption(field.grid?.rows ?? [], field.grid?.columns ?? [], getGridMatrix(field)));
  }

  // Actions Svelte : montage paresseux des graphiques dynamiques
  function initHistChart(el: HTMLDivElement, field: FieldDefinition) {
    renderHistChart(el, field);
    return {
      destroy() { histCharts[field.key]?.dispose(); delete histCharts[field.key]; },
    };
  }

  function initGridChart(el: HTMLDivElement, field: FieldDefinition) {
    renderGridChart(el, field);
    return {
      destroy() { gridCharts[field.key]?.dispose(); delete gridCharts[field.key]; },
    };
  }

  // --- Export graphiques en image ---
  /** Ouvre l'aperçu habillé du graphique ; le téléchargement s'y fait. */
  function openExport(chartInstance: ECharts | null, title: string, filename: string) {
    if (!chartInstance) {
      toasts.error("Ce graphique n'est pas encore prêt à être exporté.");
      return;
    }
    exportTarget = { chart: chartInstance as ChartImageSource, title, filename };
  }

  /** Filtres actifs, en clair : reportés dans le pied de page de l'export. */
  let filterSummary = $derived.by<string[]>(() => {
    const parts: string[] = [];
    if (filterStartDate && filterEndDate) {
      parts.push(`du ${formatDateFr(filterStartDate)} au ${formatDateFr(filterEndDate)}`);
    } else if (filterStartDate) {
      parts.push(`à partir du ${formatDateFr(filterStartDate)}`);
    } else if (filterEndDate) {
      parts.push(`jusqu'au ${formatDateFr(filterEndDate)}`);
    }
    for (const [key, selected] of Object.entries(extraFilters)) {
      if (!selected || selected.length === 0) continue;
      const field = schema.find((f) => f.key === key);
      const labels = selected.map((v) => field?.options?.find((o) => o.value === v)?.label ?? v);
      parts.push(`${field?.label ?? key} = ${labels.join(", ")}`);
    }
    return parts;
  });

  function formatDateFr(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
  }

  async function saveExportTheme() {
    savingTheme = true;
    try {
      await api.updateExportTheme(formId, exportTheme);
      savedThemeJson = JSON.stringify(exportTheme);
      toasts.success("Habillage des exports enregistré.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      savingTheme = false;
    }
  }

  function resetExportTheme() {
    exportTheme = { ...DEFAULT_EXPORT_THEME };
  }

  /** Promeut les textes saisis dans la modale vers les réglages du formulaire. */
  async function promoteExportTexts(patch: Pick<ExportTheme, "title" | "subtitle" | "caption">) {
    exportTheme = { ...exportTheme, ...patch };
    await saveExportTheme();
  }

  // Bind pie chart elements dynamically via action
  function initPieChart(el: HTMLDivElement, field: FieldDefinition) {
    renderPieChart(el, field);
    return {
      destroy() { pieCharts[field.key]?.dispose(); delete pieCharts[field.key]; },
    };
  }

  function formatResponseValue(v: unknown): string {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) {
      return v.map(formatResponseValue).join(", ");
    }
    const s = String(v);
    if (s.startsWith("__other__:")) return s.slice(10);
    if (s === "__other__") return "Autre";
    return s;
  }

  // --- Export des données filtrées (Excel / CSV / JSON) ---
  /**
   * Exporte exactement le jeu de lignes qui alimente les graphiques affichés,
   * accompagné du même contexte que les exports d'images (légende, filtres).
   */
  function buildDataExport(format: DataFormat): DataExportOptions {
    const columns = [
      { key: "__submittedAt", label: "Soumis le", kind: "date" as const },
      ...schema.map((field) => ({
        key: field.key,
        label: field.label,
        kind: (["number", "linear_scale"].includes(field.type) ? "number" : "text") as
          | "number"
          | "text",
      })),
    ];

    const rows = filteredRows.map((row) => {
      const out: Record<string, unknown> = {
        __submittedAt: new Date(row.submittedAt).toLocaleString("fr-FR"),
      };
      for (const field of schema) {
        const raw = row.values[field.key];
        out[field.key] =
          ["number", "linear_scale"].includes(field.type) && raw !== "" && raw != null
            ? Number(raw)
            : formatResponseValue(raw);
      }
      return out;
    });

    const meta = [
      { label: "Formulaire", value: formTitle },
      { label: "Réponses exportées", value: String(filteredRows.length) },
      { label: "Réponses au total", value: String(rows.length) },
      { label: "Date d'export", value: new Date().toLocaleString("fr-FR") },
      {
        label: "Filtres actifs",
        value: filterSummary.length > 0 ? filterSummary.join(" ; ") : "aucun",
      },
    ];
    if (exportTheme.subtitle) meta.push({ label: "Sous-titre", value: exportTheme.subtitle });
    if (exportTheme.caption) meta.push({ label: "Légende", value: exportTheme.caption });
    if (exportTheme.legalNotice) meta.push({ label: "Mention", value: exportTheme.legalNotice });

    return {
      filename: `${sanitizeFilename(formTitle || "reponses")}_donnees`,
      sheetName: "Réponses",
      columns,
      rows,
      format,
      meta,
      includeMeta: format !== "csv",
    };
  }

  /** Titre par défaut de l'export du tableau croisé. */
  let crossChartTitle = $derived(
    crossTab ? `${crossTab.rowLabel} × ${crossTab.colLabel}` : "Tableau croisé",
  );

  // Recent rows
  let recentRows = $derived([...rows].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5));
</script>

<svelte:head><title>{formTitle ? `Stats- ${formTitle}` : "Statistiques"}</title></svelte:head>



<!-- Filtres (date + champs à choix) -->
{#if !loading && !error}
  <div class="mb-6 bg-white border border-[color:var(--line)] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-sm animate-fade-in">
    <div class="flex items-center gap-2">
      <label class="text-xs font-bold text-slate-500 uppercase tracking-wide" for="filter-start">Du :</label>
      <input id="filter-start" class="input text-xs !w-40 !py-1" type="date" bind:value={filterStartDate} />
    </div>
    <div class="flex items-center gap-2">
      <label class="text-xs font-bold text-slate-500 uppercase tracking-wide" for="filter-end">Au :</label>
      <input id="filter-end" class="input text-xs !w-40 !py-1" type="date" bind:value={filterEndDate} />
    </div>

    {#if choiceFields.length > 0}
      <div class="h-6 w-px bg-slate-200 hidden sm:block"></div>
      <div class="flex flex-wrap items-center gap-2">
        {#each choiceFields as field (field.key)}
          <MultiSelectFilter
            options={field.options ?? []}
            selected={extraFilters[field.key] ?? []}
            onChange={(vals) => (extraFilters[field.key] = vals)}
            label={field.label}
          />
        {/each}
      </div>
    {/if}

    {#if numericFields.length > 0}
      <div class="h-6 w-px bg-slate-200 hidden sm:block"></div>
      <div class="flex flex-wrap items-center gap-3">
        {#each numericFields as field (field.key)}
          <div class="flex items-center gap-1">
            <span class="text-[11px] font-semibold text-slate-500 max-w-[110px] truncate" title={field.label}>
              {field.label}
            </span>
            <input
              class="input text-xs !w-16 !py-1"
              type="number"
              placeholder="min"
              aria-label="{field.label}- minimum"
              value={numericFilters[field.key]?.min ?? ""}
              oninput={(e) => setNumericBound(field.key, "min", e.currentTarget.value)}
            />
            <span class="text-[11px] text-slate-400">–</span>
            <input
              class="input text-xs !w-16 !py-1"
              type="number"
              placeholder="max"
              aria-label="{field.label}- maximum"
              value={numericFilters[field.key]?.max ?? ""}
              oninput={(e) => setNumericBound(field.key, "max", e.currentTarget.value)}
            />
          </div>
        {/each}
      </div>
    {/if}

    <div class="ml-auto flex items-center gap-2">
      {#if filterStartDate || filterEndDate || hasExtraFilters || hasNumericFilters}
        <button
          type="button"
          class="btn-chip"
          onclick={() => { filterStartDate = ""; filterEndDate = ""; extraFilters = {}; numericFilters = {}; }}
        >
          <IconReset size={13} /> Réinitialiser les filtres
        </button>
      {/if}
      <!-- Export du jeu de données qui alimente les graphiques affichés -->
      <DataExportMenu
        build={buildDataExport}
        rowCount={filteredRows.length}
        label="Exporter les données"
        dense
      />
    </div>
  </div>

  <!-- Direction artistique des exports : un seul réglage pour tous les PNG -->
  <div class="mb-6 animate-fade-in">
    <ExportSettingsPanel
      bind:theme={exportTheme}
      bind:open={exportPanelOpen}
      {canEdit}
      dirty={themeDirty}
      saving={savingTheme}
      onsave={saveExportTheme}
      onreset={resetExportTheme}
    />
  </div>
{/if}

{#if loading}
  <div class="animate-pulse space-y-6">
    <!-- KPIs Cards Skeletons -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {#each [1, 2, 3, 4] as _}
        <div class="bg-white border border-[color:var(--line)] rounded-2xl p-5 h-28 flex flex-col justify-between">
          <div class="h-4 bg-slate-200 rounded-md w-2/3"></div>
          <div class="h-8 bg-slate-200 rounded-md w-1/3"></div>
        </div>
      {/each}
    </div>

    <!-- Chart Skeleton -->
    <div class="bg-white border border-[color:var(--line)] rounded-2xl p-5 space-y-4">
      <div class="flex justify-between items-center">
        <div class="h-6 bg-slate-200 rounded-md w-1/4"></div>
        <div class="h-6 bg-slate-200 rounded-md w-16"></div>
      </div>
      <div class="h-52 bg-slate-50 rounded-xl w-full"></div>
    </div>

    <!-- Fill Rate Bar Chart Skeleton -->
    <div class="bg-white border border-[color:var(--line)] rounded-2xl p-5 space-y-4">
      <div class="flex justify-between items-center">
        <div class="h-6 bg-slate-200 rounded-md w-1/3"></div>
        <div class="h-6 bg-slate-200 rounded-md w-16"></div>
      </div>
      <div class="h-40 bg-slate-50 rounded-xl w-full"></div>
    </div>
  </div>
{:else if error}
  <div class="card border-l-4 border-red-400 bg-red-50 text-[color:var(--danger)] p-4">{error}</div>
{:else}

  <!-- ── KPI rapides ── -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{filteredRows.length}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Réponses totales</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{schema.length}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Champs</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">
        {filteredRows.length > 0 ? Math.round(fillRates.reduce((s,f) => s + f.rate, 0) / fillRates.length) : 0}%
      </span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Taux de remplissage moyen</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">
        {filteredActivity.filter(a => a.count > 0).length}
      </span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Jours actifs</span>
    </div>
  </div>

  <!-- ── KPI avancés ── -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{avgPerActiveDay}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Réponses / jour actif</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      {#if peakDay}
        <span class="text-3xl font-black text-[color:var(--ink)]">{peakDay.count}</span>
        <span class="text-xs font-semibold text-[color:var(--muted)]">
          Record le {new Date(peakDay.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </span>
      {:else}
        <span class="text-3xl font-black text-[color:var(--ink)]">—</span>
        <span class="text-xs font-semibold text-[color:var(--muted)]">Jour record</span>
      {/if}
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{peakHour ? `${peakHour.hour}h–${peakHour.hour + 1}h` : "—"}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Heure de pointe</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{completionRate != null ? `${completionRate}%` : "—"}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Réponses complètes (obligatoires)</span>
    </div>
  </div>

  <!-- ── Évolution des réponses ── -->
  <div class="card mb-6 animate-fade-in">
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
        <IconChartLine size={18} />
      </span>
      <h2 class="font-bold text-[color:var(--ink)]">Évolution des réponses</h2>
      <div class="ml-auto flex items-center gap-2">
        <Segmented
          label="Mode d'affichage de la courbe"
          dense
          value={evolutionMode}
          options={[
            { value: "daily", label: "Quotidien" },
            { value: "cumulative", label: "Cumulé" },
          ]}
          onchange={(v) => (evolutionMode = v as "daily" | "cumulative")}
        />
        <button
          type="button"
          class="btn-chip shrink-0"
          aria-label="Exporter la courbe d'évolution en image"
          onclick={() => openExport(lineChart, evolutionMode === 'cumulative' ? 'Réponses cumulées' : 'Évolution des réponses', 'evolution_reponses')}
        >
          <IconDownload size={13} /> PNG
        </button>
      </div>
    </div>
    <div bind:this={lineChartEl} class="h-52 w-full"></div>
  </div>

  <!-- ── Activité temporelle croisée ── -->
  <div class="card mb-6 animate-fade-in">
    <div class="flex items-center gap-2 mb-4">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
        <IconTrend size={18} />
      </span>
      <h2 class="font-bold text-[color:var(--ink)]">Quand répond-on ? (jour × heure)</h2>
      <button
        type="button"
        class="btn-chip ml-auto shrink-0"
        onclick={() => openExport(dayHourChart, 'Activité par jour et par heure', 'activite_jour_heure')}
      >
        <IconDownload size={13} /> PNG
      </button>
    </div>
    <div bind:this={dayHourEl} class="h-64 w-full"></div>
    <div class="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-[color:var(--line)]">
      <div>
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Par jour de la semaine</h3>
        <div bind:this={weekdayEl} class="h-36 w-full"></div>
      </div>
      <div>
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Par heure de la journée</h3>
        <div bind:this={hourEl} class="h-36 w-full"></div>
      </div>
    </div>
  </div>

  <!-- ── Tableau croisé dynamique ── -->
  {#if crossFields.length >= 2}
    <div class="card mb-6 animate-fade-in">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <IconCheckboxGrid size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Tableau croisé</h2>
        <button
          type="button"
          class="btn-chip ml-auto shrink-0"
          onclick={() => openExport(crossChart, crossChartTitle, 'tableau_croise')}
        >
          <IconDownload size={13} /> PNG
        </button>
      </div>

      <!-- Presets : rappeler ou figer une configuration de croisement -->
      <div class="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[color:var(--line)]">
        <label class="text-xs font-bold text-slate-500 uppercase tracking-wide" for="cross-preset">Preset :</label>
        <select
          id="cross-preset"
          class="input text-xs !w-56 !py-1"
          value={activePresetId}
          onchange={(e) => {
            const p = presets.find((x) => x.id === e.currentTarget.value);
            if (p) applyPreset(p);
            else activePresetId = "";
          }}
        >
          <option value="">— Aucun-</option>
          {#each presets as p (p.id)}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
        <button type="button" class="btn-chip" onclick={() => { presetName = ""; presetModalOpen = true; }}>
          Enregistrer…
        </button>
        {#if activePresetId}
          <button type="button" class="btn-chip" disabled={savingPreset} onclick={updateActivePreset}>
            Mettre à jour
          </button>
          <button type="button" class="btn-chip !text-red-600" onclick={deleteActivePreset}>
            Supprimer
          </button>
        {/if}
      </div>

      <!-- Sources croisées : confronter d'autres formulaires de l'organisation -->
      {#if availableForms.length > 0}
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Sources :</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
            {formTitle || "Formulaire courant"}
          </span>
          <MultiSelectFilter
            options={availableForms.map((f) => ({ value: f.id, label: f.title }))}
            selected={extraSourceIds}
            onChange={(vals) => (extraSourceIds = vals)}
            label="Ajouter un formulaire"
          />
          {#if loadingSources}
            <span class="text-[11px] text-[color:var(--muted)]">Chargement…</span>
          {/if}
          {#if isMultiSource}
            <span class="text-[11px] text-[color:var(--muted)]">
              Les réponses ne sont pas appariées entre formulaires : chaque source est comptée
              séparément, et « Formulaire (source) » est disponible comme dimension.
            </span>
          {/if}
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Lignes :</span>
          <MultiSelectFilter
            options={crossFields.map((f) => ({ value: f.key, label: f.label }))}
            selected={crossRowKeys}
            onChange={(vals) => (crossRowKeys = vals)}
            label="Champs en ligne"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Colonnes :</span>
          <MultiSelectFilter
            options={crossFields.map((f) => ({ value: f.key, label: f.label }))}
            selected={crossColKeys}
            onChange={(vals) => (crossColKeys = vals)}
            label="Champs en colonne"
          />
        </div>
        <div class="flex border border-[color:var(--line)] rounded-lg p-0.5 bg-slate-50">
          {#each [["count", "Effectifs"], ["row", "% ligne"], ["col", "% colonne"], ["total", "% total"]] as [mode, label] (mode)}
            <button
              type="button"
              class="px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer"
              class:bg-white={crossMode === mode}
              class:shadow-sm={crossMode === mode}
              class:text-[color:var(--ink)]={crossMode === mode}
              class:text-[color:var(--muted)]={crossMode !== mode}
              onclick={() => crossMode = mode as typeof crossMode}
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      {#if !crossTab}
        <p class="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 w-fit">
          Choisissez au moins un champ en ligne et un en colonne, sans qu'un même champ figure sur les deux axes.
        </p>
      {:else if crossTab.grand === 0}
        <p class="text-xs text-[color:var(--muted)] text-center py-6">Aucune réponse à croiser sur ces champs.</p>
      {:else}
        <div
          bind:this={crossChartEl}
          style="height: {Math.max(200, crossTab.rowCats.length * 44 + 60)}px"
          class="w-full mb-4"
        ></div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b-2 border-[color:var(--line)]">
                <th class="text-left py-2 pr-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">
                  {crossTab.rowLabel} \ {crossTab.colLabel}
                </th>
                {#each crossTab.colCats as col (col.value)}
                  <th class="text-right py-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide max-w-[120px] truncate">{col.label}</th>
                {/each}
                <th class="text-right py-2 pl-3 text-xs font-black text-[color:var(--ink)] uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each crossTab.rowCats as rowCat, ri (rowCat.value)}
                <tr class="border-b border-[color:var(--line)] last:border-0">
                  <td class="py-2 pr-3 font-medium text-[color:var(--ink)] max-w-[160px] truncate">{rowCat.label}</td>
                  {#each crossTab.colCats as _, ci}
                    {@const count = crossTab.matrix[ri][ci]}
                    {@const alpha = crossTab.maxCell > 0 ? (count / crossTab.maxCell) * 0.3 : 0}
                    <td class="py-2 px-3 text-right text-[color:var(--ink)] tabular-nums" style="background:rgba(34,197,94,{alpha})" title="{count} réponse(s)">
                      {crossCellText(count, ri, ci)}
                    </td>
                  {/each}
                  <td class="py-2 pl-3 text-right font-bold text-[color:var(--ink)] tabular-nums">{crossTab.rowTotals[ri]}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-[color:var(--line)]">
                <td class="py-2 pr-3 text-xs font-black text-[color:var(--ink)] uppercase tracking-wide">Total</td>
                {#each crossTab.colTotals as t}
                  <td class="py-2 px-3 text-right font-bold text-[color:var(--ink)] tabular-nums">{t}</td>
                {/each}
                <td class="py-2 pl-3 text-right font-black text-[color:var(--ink)] tabular-nums">{crossTab.grand}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="mt-3 text-[11px] text-[color:var(--muted)]">
          {crossTab.paired} réponse(s) renseignent tous les champs croisés. Les champs à choix multiples comptent une occurrence par option cochée.
        </p>
      {/if}
    </div>
  {/if}

  <!-- ── Taux de remplissage ── -->
  {#if schema.length > 0}
    <div class="card mb-6 animate-fade-in">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <IconChartBar size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Taux de remplissage par champ</h2>
        <button
          type="button"
          class="btn-chip ml-auto shrink-0"
          onclick={() => openExport(fillRateChart, 'Taux de remplissage par champ', 'taux_remplissage')}
        >
          <IconDownload size={13} /> PNG
        </button>
      </div>
      <div bind:this={fillRateChartEl} style="height: {Math.max(120, schema.length * 36)}px" class="w-full"></div>
    </div>
  {/if}

  <!-- ── Répartition choix multiples ── -->
  {#if choiceFields.length > 0}
    <div class="mb-6 animate-fade-in">
      <h2 class="font-bold text-[color:var(--ink)] mb-4 flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
          <IconChartPie size={18} />
        </span>
        Répartition des champs à choix
      </h2>
      <div class="grid gap-4 lg:grid-cols-2">
        {#each choiceFields as field (field.key)}
          {@const dist = getChoiceDistribution(field)}
          {@const total = dist.reduce((s, d) => s + d.count, 0)}
          <div class="card flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <h3 class="font-semibold text-sm text-[color:var(--ink)] truncate">{field.label}</h3>
                <button
                  type="button"
                  class="btn-chip !px-2 !py-0.5 !text-[10px] shrink-0"
                  onclick={() => openExport(pieCharts[field.key], field.label, 'repartition_' + field.key)}
                >
                  <IconDownload size={10} /> PNG
                </button>
              </div>
              {#if total === 0}
                <p class="text-xs text-[color:var(--muted)] text-center py-4">Aucune réponse</p>
              {:else}
                <!-- Les étiquettes à ligne de rappel débordent du disque :
                     la zone est plus haute que le donut lui-même. -->
                <div
                  use:initPieChart={field}
                  class="h-[300px] w-full"
                ></div>
                <ul class="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {#each dist as item, i}
                    {@const isRealOption = field.options?.some((o) => o.value === item.value) ?? false}
                    <!-- Survoler une ligne met en avant la part correspondante :
                         le lien liste ↔ graphique n'a pas à être deviné. -->
                    <li
                      class="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-slate-50"
                      onmouseenter={() => highlightSlice(field.key, i, true)}
                      onmouseleave={() => highlightSlice(field.key, i, false)}
                    >
                      {#if canEdit && isRealOption}
                        <input
                          type="color"
                          class="color-swatch shrink-0"
                          value={item.color ?? palette[i % palette.length]}
                          oninput={(e) => setOptionColor(field, item.value, (e.target as HTMLInputElement).value)}
                          title="Changer la couleur de « {item.label} »"
                        />
                      {:else}
                        <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:{item.color ?? palette[i % palette.length]}"></span>
                      {/if}
                      <span class="flex-1 truncate text-[color:var(--ink)]">{item.label}</span>
                      <span class="tabular-nums text-[color:var(--muted)]">{item.count}</span>
                      <span class="w-10 text-right font-bold tabular-nums text-[color:var(--ink)]">
                        {total > 0 ? Math.round((item.count / total) * 100) : 0} %
                      </span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Stats numériques ── -->
  {#if numericFields.length > 0}
    <div class="card mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <IconTrend size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Distribution des valeurs numériques</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[color:var(--line)]">
              <th class="text-left pb-2 pr-4 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Champ</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">N</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Min</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Q1</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Médiane</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Q3</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Max</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Moyenne</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Écart-type</th>
              <th class="text-right pb-2 pl-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Somme</th>
            </tr>
          </thead>
          <tbody>
            {#each numericFields as field (field.key)}
              {@const stats = getNumericStats(field)}
              <tr class="border-b border-[color:var(--line)] last:border-0">
                <td class="py-2.5 pr-4 font-medium text-[color:var(--ink)] truncate max-w-[160px]">{field.label}</td>
                {#if stats}
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.count}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.min}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.q1}</td>
                  <td class="py-2.5 px-3 text-right font-semibold text-[color:var(--ink)] tabular-nums">{stats.median}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.q3}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.max}</td>
                  <td class="py-2.5 px-3 text-right font-semibold text-[color:var(--ink)] tabular-nums">{stats.avg}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)] tabular-nums">{stats.stdDev}</td>
                  <td class="py-2.5 pl-3 text-right text-[color:var(--muted)] tabular-nums">{stats.sum}</td>
                {:else}
                  <td colspan="9" class="py-2.5 px-3 text-[color:var(--muted)] text-center text-xs italic">Aucune donnée</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Histogrammes ── -->
    <div class="mb-6 animate-fade-in">
      <h2 class="font-bold text-[color:var(--ink)] mb-4 flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <IconChartBar size={18} />
        </span>
        Histogrammes des champs numériques
      </h2>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each numericFields as field (field.key)}
          <div class="card">
            <div class="flex items-center justify-between gap-2 mb-2">
              <h3 class="font-semibold text-sm text-[color:var(--ink)] truncate">{field.label}</h3>
              <button
                type="button"
                class="btn-chip !px-2 !py-0.5 !text-[10px] shrink-0"
                onclick={() => openExport(histCharts[field.key], field.label, 'histogramme_' + field.key)}
              >
                <IconDownload size={10} /> PNG
              </button>
            </div>
            {#if getHistogram(field)}
              <div use:initHistChart={field} class="h-40 w-full"></div>
            {:else}
              <p class="text-xs text-[color:var(--muted)] text-center py-4">Aucune donnée</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Corrélations ── -->
  {#if correlations.length > 0}
    <div class="card mb-6 animate-fade-in">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <IconFormula size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Corrélations entre champs numériques</h2>
      </div>
      <div class="space-y-2">
        {#each correlations as c (c.a.key + c.b.key)}
          {@const pct = Math.round(Math.abs(c.r) * 100)}
          <div class="flex items-center gap-3 text-sm">
            <span class="flex-1 truncate text-[color:var(--ink)]" title="{c.a.label} × {c.b.label}">
              {c.a.label} <span class="text-[color:var(--muted)]">×</span> {c.b.label}
            </span>
            <div class="w-40 h-2.5 bg-slate-100 rounded-full overflow-hidden shrink-0" title="n = {c.n} paires">
              <div
                class="h-full rounded-full"
                style="width:{pct}%;background:{c.r >= 0 ? '#3b82f6' : '#ef4444'}"
              ></div>
            </div>
            <span class="w-16 text-right font-bold tabular-nums shrink-0" style="color:{c.r >= 0 ? '#1d4ed8' : '#b91c1c'}">
              {c.r >= 0 ? "+" : ""}{Math.round(c.r * 100) / 100}
            </span>
          </div>
        {/each}
      </div>
      <p class="mt-3 text-[11px] text-[color:var(--muted)]">
        Coefficient de Pearson entre −1 et +1 : <span class="font-semibold" style="color:#1d4ed8">bleu = corrélation positive</span>,
        <span class="font-semibold" style="color:#b91c1c">rouge = négative</span>. Calculé sur les réponses renseignant les deux champs (minimum 3).
      </p>
    </div>
  {/if}

  <!-- ── Grilles ── -->
  {#if gridFields.length > 0}
    <div class="mb-6 animate-fade-in">
      <h2 class="font-bold text-[color:var(--ink)] mb-4 flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <IconCheckboxGrid size={18} />
        </span>
        Réponses des grilles
      </h2>
      <div class="grid gap-4 lg:grid-cols-2">
        {#each gridFields as field (field.key)}
          <div class="card">
            <div class="flex items-center justify-between gap-2 mb-2">
              <h3 class="font-semibold text-sm text-[color:var(--ink)] truncate">{field.label}</h3>
              <button
                type="button"
                class="btn-chip !px-2 !py-0.5 !text-[10px] shrink-0"
                onclick={() => openExport(gridCharts[field.key], field.label, 'grille_' + field.key)}
              >
                <IconDownload size={10} /> PNG
              </button>
            </div>
            <div
              use:initGridChart={field}
              style="height: {Math.max(160, (field.grid?.rows.length ?? 0) * 40 + 50)}px"
              class="w-full"
            ></div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Mots fréquents ── -->
  {#if textFields.length > 0 && wordCloud.length > 0}
    <div class="card mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
          <IconTable size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Mots les plus fréquents (champs texte)</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each wordCloud as item}
          {@const maxCount = wordCloud[0]?.count ?? 1}
          {@const size = 11 + Math.round((item.count / maxCount) * 14)}
          {@const opacity = 0.5 + (item.count / maxCount) * 0.5}
          <span
            class="rounded-full bg-green-50 text-green-700 font-semibold px-3 py-1 transition hover:bg-green-100 cursor-default"
            style="font-size:{size}px;opacity:{opacity}"
            title="{item.count} occurrence(s)"
          >
            {item.word}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Dernières réponses ── -->
  {#if recentRows.length > 0}
    <div class="card">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <IconCheck size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">5 dernières réponses</h2>
        <button class="ml-auto btn-secondary text-xs !py-1.5" onclick={() => goto(`/admin/forms/${formId}/responses`)}>
          Voir tout →
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[color:var(--line)]">
              <th class="text-left pb-2 pr-4 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Date</th>
              {#each schema.slice(0, 3) as field}
                <th class="text-left pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide truncate max-w-[120px]">{field.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each recentRows as row (row.id)}
              <tr class="border-b border-[color:var(--line)] last:border-0 hover:bg-slate-50/50 transition">
                <td class="py-2.5 pr-4 text-[color:var(--muted)] text-xs whitespace-nowrap">
                  {new Date(row.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                {#each schema.slice(0, 3) as field}
                  <td class="py-2.5 px-3 text-[color:var(--ink)] truncate max-w-[140px]">
                    {#if row.values[field.key] == null || row.values[field.key] === ""}
                      <span class="text-[color:var(--muted)] italic text-xs">—</span>
                    {:else}
                      {formatResponseValue(row.values[field.key])}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="card !p-0">
      <EmptyState
        icon={IconChartBar}
        title="Aucune réponse pour le moment"
        hint="Les statistiques apparaîtront dès la première soumission. Partagez le lien public du formulaire pour commencer la collecte."
      />
    </div>
  {/if}

{/if}

<!-- Aperçu habillé du graphique avant téléchargement -->
<ExportPreviewModal
  open={exportTarget !== null}
  chart={exportTarget?.chart ?? null}
  theme={exportTheme}
  filename={exportTarget?.filename ?? "export"}
  context={{
    chartTitle: exportTarget?.title ?? "",
    formTitle,
    responseCount: filteredRows.length,
    filterSummary,
  }}
  {canEdit}
  onclose={() => (exportTarget = null)}
  onpromote={promoteExportTexts}
/>

<!-- Enregistrement d'un preset de croisement -->
<Modal
  open={presetModalOpen}
  title="Enregistrer ce croisement"
  description="Champs croisés, sources, filtres et mode d'affichage sont mémorisés."
  size="sm"
  dismissible={!savingPreset}
  onclose={() => (presetModalOpen = false)}
>
  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1" for="preset-name">
    Nom du preset
  </label>
  <input
    id="preset-name"
    class="input w-full"
    bind:value={presetName}
    placeholder="Ex. Satisfaction par tranche d'âge"
    onkeydown={(e) => { if (e.key === "Enter") savePreset(); }}
  />

  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={() => (presetModalOpen = false)}>Annuler</button>
    <button type="button" class="btn-primary" disabled={savingPreset || !presetName.trim()} onclick={savePreset}>
      {savingPreset ? "Enregistrement…" : "Enregistrer"}
    </button>
  {/snippet}
</Modal>

<style>
  :global(.card) {
    background: white;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1.25rem;
  }
  .color-swatch {
    width: 1.1rem;
    height: 1.1rem;
    padding: 0;
    border: none;
    border-radius: 9999px;
    cursor: pointer;
    background: none;
  }
  .color-swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .color-swatch::-webkit-color-swatch {
    border: none;
    border-radius: 9999px;
  }
</style>
