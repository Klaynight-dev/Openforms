<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { FieldDefinition, ResponseRow, FormDetail } from "$lib/types.ts";
  import MultiSelectFilter from "$lib/components/MultiSelectFilter.svelte";
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
  } from "$lib/icons.ts";
  // echarts chargé dynamiquement (grosse dépendance) : hors du bundle initial.
  import type { ECharts } from "echarts";
  let echarts: typeof import("echarts") | null = null;

  // Palette catégorielle partagée (ordre fixe) + rampe séquentielle verte (heatmaps).
  const COLORS = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];
  const HEAT_COLORS = ["#f0fdf4", "#86efac", "#22c55e", "#15803d"];
  const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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
  let saveMessage = $state<string | null>(null);

  // Filtres additionnels : valeurs sélectionnées par champ à choix.
  let extraFilters = $state<Record<string, string[]>>({});
  let hasExtraFilters = $derived(Object.values(extraFilters).some((v) => v.length > 0));

  // ECharts instances
  let lineChartEl = $state<HTMLDivElement>();
  let lineChart: ECharts | null = null;
  let pieChartEls: Record<string, HTMLDivElement> = {};
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

  // Tableau croisé : champs sélectionnés + mode d'affichage
  let crossRowKey = $state("");
  let crossColKey = $state("");
  let crossMode = $state<"count" | "row" | "col" | "total">("count");

  // Date range filtering
  let filterStartDate = $state("");
  let filterEndDate = $state("");

  let filteredRows = $derived.by<ResponseRow[]>(() => {
    let data = rows;
    if (filterStartDate || filterEndDate) {
      const start = filterStartDate ? new Date(filterStartDate).getTime() : 0;
      const end = filterEndDate ? new Date(filterEndDate).getTime() : Infinity;
      data = data.filter((r) => {
        const t = new Date(r.submittedAt).getTime();
        return t >= start && t <= end;
      });
    }
    for (const [key, selected] of Object.entries(extraFilters)) {
      if (!selected || selected.length === 0) continue;
      data = data.filter((r) => {
        const v = r.values[key];
        const vals = Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [];
        return vals.some((x) => selected.includes(x));
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
    const el = pieChartEls[field.key];
    if (el) renderPieChart(el, field);
    try {
      await persistSchema(schema);
    } catch (e) {
      saveMessage = e instanceof Error ? e.message : "Impossible d'enregistrer la couleur.";
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
  let crossFields = $derived(
    schema.filter((f) => ["radio", "select", "checkbox", "linear_scale"].includes(f.type))
  );

  $effect(() => {
    if (crossFields.length >= 2 && !crossRowKey) {
      crossRowKey = crossFields[0].key;
      crossColKey = crossFields[1].key;
    }
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

  let crossTab = $derived.by(() => {
    const rowField = crossFields.find((f) => f.key === crossRowKey);
    const colField = crossFields.find((f) => f.key === crossColKey);
    if (!rowField || !colField || rowField.key === colField.key) return null;

    const rowCats = choiceCategories(rowField);
    const colCats = choiceCategories(colField);
    const rowIndex = new Map(rowCats.map((c, i) => [c.value, i]));
    const colIndex = new Map(colCats.map((c, i) => [c.value, i]));

    // Valeurs observées hors options (données libres) : ajoutées en fin
    for (const row of filteredRows) {
      for (const v of extractChoiceValues(row, rowField)) {
        if (!rowIndex.has(v)) { rowIndex.set(v, rowCats.length); rowCats.push({ value: v, label: v }); }
      }
      for (const v of extractChoiceValues(row, colField)) {
        if (!colIndex.has(v)) { colIndex.set(v, colCats.length); colCats.push({ value: v, label: v }); }
      }
    }

    const matrix = rowCats.map(() => colCats.map(() => 0));
    let paired = 0;
    for (const row of filteredRows) {
      const rv = extractChoiceValues(row, rowField);
      const cv = extractChoiceValues(row, colField);
      if (rv.length === 0 || cv.length === 0) continue;
      paired++;
      for (const r of rv) {
        for (const c of cv) {
          matrix[rowIndex.get(r)!][colIndex.get(c)!]++;
        }
      }
    }

    const rowTotals = matrix.map((r) => r.reduce((a, b) => a + b, 0));
    const colTotals = colCats.map((_, ci) => matrix.reduce((s, r) => s + r[ci], 0));
    const grand = rowTotals.reduce((a, b) => a + b, 0);
    const maxCell = Math.max(0, ...matrix.flat());
    return { rowField, colField, rowCats, colCats, matrix, rowTotals, colTotals, grand, maxCell, paired };
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
        api.listResponses(formId),
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
  $effect(() => {
    if (filteredRows && evolutionMode && !loading) {
      // Delay slightly to allow DOM updates
      setTimeout(() => {
        renderLineChart();
        renderFillRateChart();
        renderDayHourChart();
        renderWeekdayChart();
        renderHourChart();
        choiceFields.forEach((field) => {
          const el = pieChartEls[field.key];
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
    }
  });

  // Le tableau croisé dépend aussi des champs choisis : effet dédié
  $effect(() => {
    if (crossTab && crossChartEl && !loading) {
      setTimeout(renderCrossChart, 50);
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
        lineStyle: { color: "#22c55e", width: 2.5 },
        itemStyle: { color: "#22c55e", borderColor: "#fff", borderWidth: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(34,197,94,0.25)" }, { offset: 1, color: "rgba(34,197,94,0)" }]) },
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

    chart.setOption({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { show: false },
      series: [{
        type: "pie",
        radius: ["42%", "72%"],
        data: dist.map((d, i) => ({ name: d.label, value: d.count, itemStyle: { color: d.color ?? COLORS[i % COLORS.length] } })),
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: "bold" } },
      }],
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
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", color: "#94a3b8", fontSize: 11 }, splitLine: { lineStyle: { color: "#f1f5f9" } } },
      yAxis: { type: "category", data: sorted.map((f) => f.label.length > 22 ? f.label.slice(0, 22) + "…" : f.label), axisLabel: { color: "#475569", fontSize: 11 }, axisTick: { show: false } },
      series: [{
        type: "bar",
        data: sorted.map((f) => ({
          value: f.rate,
          itemStyle: { color: f.rate >= 75 ? "#22c55e" : f.rate >= 40 ? "#f59e0b" : "#ef4444", borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
      }],
    });
  }

  /** Options ECharts communes aux heatmaps (rampe séquentielle verte, valeurs affichées). */
  function heatmapOption(rowLabels: string[], colLabels: string[], matrix: number[][]) {
    const maxVal = Math.max(1, ...matrix.flat());
    // ECharts trace l'axe Y de bas en haut : on inverse pour lire de haut en bas
    const data: [number, number, number][] = [];
    matrix.forEach((row, ri) => {
      row.forEach((v, ci) => data.push([ci, rowLabels.length - 1 - ri, v]));
    });
    return {
      tooltip: {
        formatter: (p: any) =>
          `${rowLabels[rowLabels.length - 1 - p.value[1]]} × ${colLabels[p.value[0]]}<br/><b>${p.value[2]} réponse(s)</b>`,
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: colLabels, axisTick: { show: false }, axisLabel: { color: "#94a3b8", fontSize: 10 }, splitArea: { show: true } },
      yAxis: { type: "category", data: [...rowLabels].reverse(), axisTick: { show: false }, axisLabel: { color: "#475569", fontSize: 11 }, splitArea: { show: true } },
      visualMap: { show: false, min: 0, max: maxVal, inRange: { color: HEAT_COLORS } },
      series: [{
        type: "heatmap",
        data,
        label: { show: true, fontSize: 10, color: "#334155", formatter: (p: any) => (p.value[2] > 0 ? p.value[2] : "") },
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
      }],
    };
  }

  /** Options ECharts communes aux barres simples vertes. */
  function barOption(labels: string[], counts: number[], xLabelInterval: number | "auto" = "auto") {
    return {
      tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} réponse(s)</b>` },
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisLabel: { color: "#94a3b8", fontSize: 10, interval: xLabelInterval } },
      yAxis: { type: "value", minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: "#f1f5f9" } }, axisLabel: { color: "#94a3b8", fontSize: 10 } },
      series: [{
        type: "bar",
        data: counts,
        itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 22,
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
    if (!echarts || !crossChartEl || !crossTab) return;
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
        crossTab.matrix
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
  function exportChartImage(chartInstance: ECharts | null, filename: string) {
    if (!chartInstance) return;
    try {
      const url = chartInstance.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff"
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert("Erreur lors de l'exportation du graphique.");
    }
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

  // Recent rows
  let recentRows = $derived([...rows].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5));
</script>

<svelte:head><title>{formTitle ? `Stats — ${formTitle}` : "Statistiques"}</title></svelte:head>



<!-- Filtres (date + champs à choix) -->
{#if !loading && !error}
  <div class="mb-6 bg-white border border-[color:var(--line)] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-sm animate-fade-in">
    <div class="flex items-center gap-2">
      <label class="text-xs font-bold text-slate-500 uppercase tracking-wide">Du :</label>
      <input class="input text-xs !w-40 !py-1" type="date" bind:value={filterStartDate} />
    </div>
    <div class="flex items-center gap-2">
      <label class="text-xs font-bold text-slate-500 uppercase tracking-wide">Au :</label>
      <input class="input text-xs !w-40 !py-1" type="date" bind:value={filterEndDate} />
    </div>

    {#if choiceFields.length > 0}
      <div class="h-6 w-px bg-slate-200 hidden sm:block"></div>
      <div class="flex flex-wrap items-center gap-2">
        {#each choiceFields as field (field.key)}
          <MultiSelectFilter
            options={field.options ?? []}
            bind:selected={extraFilters[field.key]}
            label={field.label}
          />
        {/each}
      </div>
    {/if}

    {#if filterStartDate || filterEndDate || hasExtraFilters}
      <button
        type="button"
        class="text-xs text-brand font-bold hover:underline"
        onclick={() => { filterStartDate = ""; filterEndDate = ""; extraFilters = {}; }}
      >
        Réinitialiser les filtres
      </button>
    {/if}
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
        <div class="flex border border-[color:var(--line)] rounded-lg p-0.5 bg-slate-50">
          <button
            type="button"
            class="px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer"
            class:bg-white={evolutionMode === "daily"}
            class:shadow-sm={evolutionMode === "daily"}
            class:text-[color:var(--ink)]={evolutionMode === "daily"}
            class:text-[color:var(--muted)]={evolutionMode !== "daily"}
            onclick={() => evolutionMode = "daily"}
          >
            Quotidien
          </button>
          <button
            type="button"
            class="px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer"
            class:bg-white={evolutionMode === "cumulative"}
            class:shadow-sm={evolutionMode === "cumulative"}
            class:text-[color:var(--ink)]={evolutionMode === "cumulative"}
            class:text-[color:var(--muted)]={evolutionMode !== "cumulative"}
            onclick={() => evolutionMode = "cumulative"}
          >
            Cumulé
          </button>
        </div>
        <button
          type="button"
          class="btn-secondary text-xs !py-1 !px-2 flex items-center gap-1 shrink-0"
          onclick={() => exportChartImage(lineChart, 'evolution_reponses')}
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
        class="btn-secondary ml-auto text-xs !py-1 !px-2 flex items-center gap-1 shrink-0"
        onclick={() => exportChartImage(dayHourChart, 'activite_jour_heure')}
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
          class="btn-secondary ml-auto text-xs !py-1 !px-2 flex items-center gap-1 shrink-0"
          onclick={() => exportChartImage(crossChart, 'tableau_croise')}
        >
          <IconDownload size={13} /> PNG
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex items-center gap-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-wide">Lignes :</label>
          <select class="input text-xs !w-52 !py-1" bind:value={crossRowKey}>
            {#each crossFields as f (f.key)}
              <option value={f.key}>{f.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-wide">Colonnes :</label>
          <select class="input text-xs !w-52 !py-1" bind:value={crossColKey}>
            {#each crossFields as f (f.key)}
              <option value={f.key}>{f.label}</option>
            {/each}
          </select>
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
          Choisissez deux champs différents pour croiser leurs réponses.
        </p>
      {:else if crossTab.grand === 0}
        <p class="text-xs text-[color:var(--muted)] text-center py-6">Aucune réponse à croiser sur ces deux champs.</p>
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
                  {crossTab.rowField.label} \ {crossTab.colField.label}
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
          {crossTab.paired} réponse(s) renseignent les deux champs. Les champs à choix multiples comptent une occurrence par option cochée.
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
          class="btn-secondary ml-auto text-xs !py-1 !px-2 flex items-center gap-1 shrink-0"
          onclick={() => exportChartImage(fillRateChart, 'taux_remplissage')}
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
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each choiceFields as field (field.key)}
          {@const dist = getChoiceDistribution(field)}
          {@const total = dist.reduce((s, d) => s + d.count, 0)}
          <div class="card flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <h3 class="font-semibold text-sm text-[color:var(--ink)] truncate">{field.label}</h3>
                <button
                  type="button"
                  class="text-[10px] text-slate-400 hover:text-brand font-bold flex items-center gap-0.5 shrink-0"
                  onclick={() => exportChartImage(pieCharts[field.key], 'repartition_' + field.key)}
                >
                  <IconDownload size={10} /> PNG
                </button>
              </div>
              {#if total === 0}
                <p class="text-xs text-[color:var(--muted)] text-center py-4">Aucune réponse</p>
              {:else}
                <div
                  use:initPieChart={field}
                  class="h-40 w-full"
                ></div>
                <div class="mt-3 space-y-1.5">
                  {#each dist.slice(0, 4) as item, i}
                    {@const isRealOption = field.options?.some((o) => o.value === item.value) ?? false}
                    <div class="flex items-center gap-2 text-xs">
                      {#if canEdit && isRealOption}
                        <input
                          type="color"
                          class="color-swatch shrink-0"
                          value={item.color ?? COLORS[i % COLORS.length]}
                          oninput={(e) => setOptionColor(field, item.value, (e.target as HTMLInputElement).value)}
                          title="Changer la couleur de « {item.label} »"
                        />
                      {:else}
                        <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:{item.color ?? COLORS[i % COLORS.length]}"></span>
                      {/if}
                      <span class="flex-1 truncate text-[color:var(--ink)]">{item.label}</span>
                      <span class="font-bold text-[color:var(--muted)]">{total > 0 ? Math.round((item.count / total) * 100) : 0}%</span>
                    </div>
                  {/each}
                </div>
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
                class="text-[10px] text-slate-400 hover:text-brand font-bold flex items-center gap-0.5 shrink-0"
                onclick={() => exportChartImage(histCharts[field.key], 'histogramme_' + field.key)}
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
                class="text-[10px] text-slate-400 hover:text-brand font-bold flex items-center gap-0.5 shrink-0"
                onclick={() => exportChartImage(gridCharts[field.key], 'grille_' + field.key)}
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
    <div class="card flex flex-col items-center gap-3 py-12 text-center text-[color:var(--muted)]">
      <IconChartBar size={36} class="opacity-30" />
      <p class="font-semibold">Aucune réponse pour le moment.</p>
      <p class="text-sm">Les statistiques apparaîtront dès la première soumission.</p>
    </div>
  {/if}

{/if}

{#if saveMessage}
  <div class="save-toast">
    <span>{saveMessage}</span>
    <button type="button" onclick={() => (saveMessage = null)} aria-label="Fermer">×</button>
  </div>
{/if}

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
  .save-toast {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    padding: 0.6rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
    z-index: 50;
  }
  .save-toast button {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: 1rem;
    line-height: 1;
  }
</style>
