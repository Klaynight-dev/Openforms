<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { FieldDefinition, ResponseRow } from "$lib/types.ts";
  import {
    IconBack,
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconTrend,
    IconTable,
    IconCheck,
  } from "$lib/icons.ts";
  import * as echarts from "echarts";

  const formId = $derived($page.params.id as string);

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let formTitle = $state("");
  let schema = $state<FieldDefinition[]>([]);
  let rows = $state<ResponseRow[]>([]);
  let activity = $state<{ date: string; count: number }[]>([]);

  // ECharts instances
  let lineChartEl = $state<HTMLDivElement>();
  let lineChart: echarts.ECharts | null = null;
  let pieChartEls: Record<string, HTMLDivElement> = {};
  let pieCharts: Record<string, echarts.ECharts> = {};
  let fillRateChartEl = $state<HTMLDivElement>();
  let fillRateChart: echarts.ECharts | null = null;

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

  function getChoiceDistribution(field: FieldDefinition): { label: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const opt of field.options ?? []) counts[opt.value] = 0;
    for (const row of rows) {
      const val = row.values[field.key];
      if (val == null) continue;
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals) {
        const key = String(v);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return Object.entries(counts).map(([v, count]) => {
      let label = field.options?.find((o) => o.value === v)?.label ?? v;
      if (label.startsWith("__other__:")) {
        label = label.slice("__other__:".length);
      } else if (label === "__other__") {
        label = "Autre";
      }
      return { label, count };
    }).sort((a, b) => b.count - a.count);
  }

  function getNumericStats(field: FieldDefinition) {
    const vals = rows
      .map((r) => Number(r.values[field.key]))
      .filter((v) => !isNaN(v));
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    const mid = Math.floor(sorted.length / 2);
    return {
      count: vals.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round((sum / vals.length) * 100) / 100,
      median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    };
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
      for (const row of rows) {
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
    if (rows.length === 0) return 0;
    const filled = rows.filter((r) => {
      const v = r.values[field.key];
      return v !== null && v !== undefined && v !== "";
    }).length;
    return Math.round((filled / rows.length) * 100);
  }

  let wordCloud = $derived(getWordCloud(textFields));
  let fillRates = $derived(schema.map((f) => ({ label: f.label, rate: getFillRate(f) })));

  // ─── Data loading ────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const [statsRes, responseRes] = await Promise.all([
        api.getFormStatsSummary(formId),
        api.listResponses(formId),
      ]);
      formTitle = statsRes.summary.title;
      activity = statsRes.summary.activity;
      schema = responseRes.form.schema as FieldDefinition[];
      rows = responseRes.rows;
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
    Object.values(pieCharts).forEach((c) => c.dispose());
  });

  function renderLineChart() {
    if (!lineChartEl) return;
    lineChart = echarts.init(lineChartEl, null, { renderer: "svg" });
    const dates = activity.map((a) => {
      const d = new Date(a.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const counts = activity.map((a) => a.count);
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
    if (!el || total === 0) return;
    const chart = echarts.init(el, null, { renderer: "svg" });
    pieCharts[field.key] = chart;

    const COLORS = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];
    chart.setOption({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { show: false },
      series: [{
        type: "pie",
        radius: ["42%", "72%"],
        data: dist.map((d, i) => ({ name: d.label, value: d.count, itemStyle: { color: COLORS[i % COLORS.length] } })),
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: "bold" } },
      }],
    });
  }

  function renderFillRateChart() {
    if (!fillRateChartEl || fillRates.length === 0) return;
    fillRateChart = echarts.init(fillRateChartEl, null, { renderer: "svg" });
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

<!-- Back button -->
<div class="mb-6 flex items-center gap-3">
  <button class="btn-secondary !p-2" onclick={() => goto(`/admin/forms/${formId}/responses`)} aria-label="Retour">
    <IconBack size={18} />
  </button>
  <div>
    <p class="text-xs text-[color:var(--muted)] font-semibold uppercase tracking-wide">Formulaire</p>
    <h1 class="text-xl font-bold text-[color:var(--ink)]">{formTitle || "Statistiques"}</h1>
  </div>
</div>

{#if loading}
  <div class="flex items-center gap-3 text-[color:var(--muted)] py-12 justify-center">
    <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" class="opacity-75"/></svg>
    Chargement des statistiques…
  </div>
{:else if error}
  <div class="card border-l-4 border-red-400 bg-red-50 text-[color:var(--danger)] p-4">{error}</div>
{:else}

  <!-- ── KPI rapides ── -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{rows.length}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Réponses totales</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">{schema.length}</span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Champs</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">
        {rows.length > 0 ? Math.round(fillRates.reduce((s,f) => s + f.rate, 0) / fillRates.length) : 0}%
      </span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Taux de remplissage moyen</span>
    </div>
    <div class="card flex flex-col gap-1 items-center text-center py-5">
      <span class="text-3xl font-black text-[color:var(--ink)]">
        {activity.filter(a => a.count > 0).length}
      </span>
      <span class="text-xs font-semibold text-[color:var(--muted)]">Jours actifs (30j)</span>
    </div>
  </div>

  <!-- ── Évolution des réponses ── -->
  <div class="card mb-6">
    <div class="flex items-center gap-2 mb-4">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
        <IconChartLine size={18} />
      </span>
      <h2 class="font-bold text-[color:var(--ink)]">Évolution des réponses (30 derniers jours)</h2>
    </div>
    <div bind:this={lineChartEl} class="h-52 w-full"></div>
  </div>

  <!-- ── Taux de remplissage ── -->
  {#if schema.length > 0}
    <div class="card mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <IconChartBar size={18} />
        </span>
        <h2 class="font-bold text-[color:var(--ink)]">Taux de remplissage par champ</h2>
      </div>
      <div bind:this={fillRateChartEl} style="height: {Math.max(120, schema.length * 36)}px" class="w-full"></div>
    </div>
  {/if}

  <!-- ── Répartition choix multiples ── -->
  {#if choiceFields.length > 0}
    <div class="mb-6">
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
          <div class="card">
            <h3 class="font-semibold text-sm text-[color:var(--ink)] mb-3 truncate">{field.label}</h3>
            {#if total === 0}
              <p class="text-xs text-[color:var(--muted)] text-center py-4">Aucune réponse</p>
            {:else}
              <div
                use:initPieChart={field}
                class="h-40 w-full"
              ></div>
              <div class="mt-3 space-y-1.5">
                {#each dist.slice(0, 4) as item, i}
                  {@const COLORS = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"]}
                  <div class="flex items-center gap-2 text-xs">
                    <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:{COLORS[i % COLORS.length]}"></span>
                    <span class="flex-1 truncate text-[color:var(--ink)]">{item.label}</span>
                    <span class="font-bold text-[color:var(--muted)]">{total > 0 ? Math.round((item.count / total) * 100) : 0}%</span>
                  </div>
                {/each}
              </div>
            {/if}
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
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Max</th>
              <th class="text-right pb-2 px-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Moyenne</th>
              <th class="text-right pb-2 pl-3 text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">Médiane</th>
            </tr>
          </thead>
          <tbody>
            {#each numericFields as field (field.key)}
              {@const stats = getNumericStats(field)}
              <tr class="border-b border-[color:var(--line)] last:border-0">
                <td class="py-2.5 pr-4 font-medium text-[color:var(--ink)] truncate max-w-[160px]">{field.label}</td>
                {#if stats}
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)]">{stats.count}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)]">{stats.min}</td>
                  <td class="py-2.5 px-3 text-right text-[color:var(--muted)]">{stats.max}</td>
                  <td class="py-2.5 px-3 text-right font-semibold text-[color:var(--ink)]">{stats.avg}</td>
                  <td class="py-2.5 pl-3 text-right text-[color:var(--muted)]">{stats.median}</td>
                {:else}
                  <td colspan="5" class="py-2.5 px-3 text-[color:var(--muted)] text-center text-xs italic">Aucune donnée</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
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

<style>
  :global(.card) {
    background: white;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1.25rem;
  }
</style>
