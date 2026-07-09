<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Tableur from "$components/Tableur.svelte";
  import { api } from "$api/client.ts";
  import type { FieldDefinition, MetaColumn, ResponseRow, FormDetail } from "$lib/types.ts";
  import {
    IconBack,
    IconEdit,
    IconEye,
    IconChartBar,
    IconTable,
    IconCanvas,
    IconSettings,
    IconClose,
    IconDownload,
    IconCheck,
    IconLeaf
  } from "$lib/icons.ts";

  const id = $page.params.id as string;

  // Global State
  let title = $state("Réponses");
  let fields = $state<FieldDefinition[]>([]);
  let metaColumns = $state<MetaColumn[]>([]);
  let rows = $state<ResponseRow[]>([]);
  let canEdit = $state(false);
  let detail = $state<FormDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // View state
  let activeView = $state<"table" | "kanban" | "fiches">("table");

  // Kanban view state
  let kanbanGroupKey = $state<string>("");
  let draggingRowId = $state<string | null>(null);

  // Fiches view state
  let selectedRowIndex = $state<number>(0);
  let selectedRow = $derived(rows[selectedRowIndex] ?? null);

  // Groupable fields for Kanban
  let groupableFields = $derived([
    ...fields.filter((f) => ["radio", "select", "checkbox"].includes(f.type)),
    ...metaColumns.filter((m) => m.kind === "text"),
  ]);

  $effect(() => {
    if (groupableFields.length > 0 && !kanbanGroupKey) {
      kanbanGroupKey = groupableFields[0].key;
    }
  });

  onMount(async () => {
    try {
      const [res, formRes] = await Promise.all([
        api.listResponses(id),
        api.getForm(id).catch(() => null),
      ]);
      title = res.form.title;
      fields = res.form.schema;
      metaColumns = res.form.metaColumns;
      rows = res.rows;
      canEdit = res.permission === "WRITE";
      if (formRes) detail = formRes.form;
    } catch (e) {
      error = e instanceof Error ? e.message : "Chargement impossible.";
    } finally {
      loading = false;
    }
  });

  // Persist metadata columns in backend
  async function persistColumns(cols: MetaColumn[]) {
    if (!detail) return;
    try {
      await api.updateForm(id, {
        title: detail.title,
        description: detail.description ?? undefined,
        schema: fields,
        metaColumns: cols,
        requireConsent: detail.requireConsent,
        consentText: detail.consentText ?? undefined,
        isAnonymized: detail.isAnonymized,
        encryptResponses: detail.encryptResponses,
        notifyOwner: detail.notifyOwner,
        sendConfirmationEmail: detail.sendConfirmationEmail,
        confirmationEmailText: detail.confirmationEmailText ?? undefined,
        webhookUrl: detail.webhookUrl ?? undefined,
        startsAt: detail.startsAt ?? undefined,
        endsAt: detail.endsAt ?? undefined,
        maxResponses: detail.maxResponses ?? undefined,
        translations: detail.translations,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'enregistrer les colonnes.");
    }
  }

  // --- Kanban Logic ---
  let kanbanColumns = $derived.by<{ value: string; label: string }[]>(() => {
    if (!kanbanGroupKey) return [];
    const field = fields.find((f) => f.key === kanbanGroupKey);
    if (field && field.options) {
      return [
        ...field.options.map((o) => ({ value: o.value, label: o.label })),
        { value: "", label: "Non défini" },
      ];
    }
    // Meta text columns
    const valuesSet = new Set<string>();
    for (const r of rows) {
      const val = r.metadata[kanbanGroupKey] || r.values[kanbanGroupKey];
      if (val) valuesSet.add(String(val));
    }
    const cols = Array.from(valuesSet).map((v) => ({ value: v, label: v }));
    cols.push({ value: "", label: "Non défini" });
    return cols;
  });

  function getRowsInColumn(colValue: string): ResponseRow[] {
    const isMeta = metaColumns.some((m) => m.key === kanbanGroupKey);
    return rows.filter((r) => {
      const val = isMeta ? r.metadata[kanbanGroupKey] : r.values[kanbanGroupKey];
      const normalizedVal = val == null ? "" : String(val);
      return normalizedVal === colValue;
    });
  }

  function onDragStartCard(rowId: string) {
    draggingRowId = rowId;
  }

  async function onDropLane(colValue: string) {
    if (!draggingRowId) return;
    const rowId = draggingRowId;
    draggingRowId = null;

    const isMeta = metaColumns.some((m) => m.key === kanbanGroupKey);
    const target = isMeta ? "meta" : "field";

    // Immediate UI feedback update
    rows = rows.map((r) => {
      if (r.id === rowId) {
        const next = { ...r };
        if (isMeta) next.metadata = { ...next.metadata, [kanbanGroupKey]: colValue || "" };
        else next.values = { ...next.values, [kanbanGroupKey]: colValue || "" };
        return next;
      }
      return r;
    });

    try {
      await api.updateCell(rowId, target, kanbanGroupKey, colValue || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impossible de modifier la réponse.");
      const res = await api.listResponses(id);
      rows = res.rows;
    }
  }

  // --- Export PDF ---
  function exportActiveRowPDF() {
    window.print();
  }

  function formatValue(v: unknown): string {
    if (v == null || v === "") return "—";
    if (typeof v === "object") {
      if ((v as any).paid) {
        return `Payé : ${(v as any).amount} € (ID: ${(v as any).transactionId})`;
      }
      return JSON.stringify(v);
    }
    return String(v);
  }
</script>

<svelte:head><title>Réponses — {title}</title></svelte:head>


<!-- Tabs selector -->
<div class="no-print flex border border-[color:var(--line)] bg-white rounded-xl p-1 mb-5 w-fit shadow-sm">
  <button
    type="button"
    class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer select-none"
    class:bg-brand={activeView === "table"}
    class:text-white={activeView === "table"}
    class:text-[color:var(--muted)]={activeView !== "table"}
    onclick={() => activeView = "table"}
  >
    <IconTable size={14} /> Tableur
  </button>
  <button
    type="button"
    class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer select-none"
    class:bg-brand={activeView === "kanban"}
    class:text-white={activeView === "kanban"}
    class:text-[color:var(--muted)]={activeView !== "kanban"}
    onclick={() => activeView = "kanban"}
  >
    <IconCanvas size={14} /> Kanban
  </button>
  <button
    type="button"
    class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer select-none"
    class:bg-brand={activeView === "fiches"}
    class:text-white={activeView === "fiches"}
    class:text-[color:var(--muted)]={activeView !== "fiches"}
    onclick={() => activeView = "fiches"}
  >
    <IconSettings size={14} /> Fiches Détails
  </button>
</div>

{#if loading}
  <div class="flex items-center justify-center py-12 text-slate-500 gap-2">
    <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" class="opacity-75"/></svg>
    Chargement…
  </div>
{:else if error}
  <p class="text-red-600 font-semibold p-4">{error}</p>
{:else}
  {#if activeView === "table"}
    <!-- --- Tableur (Default homemade grid) --- -->
    <div class="no-print">
      <Tableur
        formId={id}
        formTitle={title}
        {fields}
        bind:metaColumns
        bind:rows
        {canEdit}
        onMetaColumnsChange={persistColumns}
      />
    </div>
  {:else if activeView === "kanban"}
    <!-- --- Kanban Board --- -->
    <div class="no-print flex flex-col gap-4 animate-fade-in">
      <div class="flex items-center gap-3 bg-white p-4 rounded-2xl border border-[color:var(--line)] shadow-sm">
        <label class="text-xs font-bold text-slate-500 uppercase tracking-wide shrink-0">Regrouper les cartes par :</label>
        {#if groupableFields.length === 0}
          <span class="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            Aucun champ ou métadonnée textuelle disponible pour le regroupement.
          </span>
        {:else}
          <select class="input text-xs !w-64" bind:value={kanbanGroupKey}>
            {#each groupableFields as f}
              <option value={f.key}>{f.label} ({metaColumns.some(m => m.key === f.key) ? 'Métadonnée' : 'Question'})</option>
            {/each}
          </select>
        {/if}
      </div>

      {#if kanbanGroupKey}
        <div class="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto pb-4 max-h-[70vh]">
          {#each kanbanColumns as col}
            {@const items = getRowsInColumn(col.value)}
            <div
              class="flex flex-col gap-3 rounded-2xl bg-slate-50/70 border border-slate-200/60 p-3 min-h-[300px]"
              ondragover={(e) => e.preventDefault()}
              ondrop={() => onDropLane(col.value)}
            >
              <div class="flex items-center justify-between border-b border-slate-200 pb-2 mb-1 px-1">
                <span class="text-xs font-black text-slate-700 uppercase tracking-wider">{col.label}</span>
                <span class="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div class="flex flex-col gap-2.5 overflow-y-auto max-h-[55vh]">
                {#each items as row}
                  {@const labelField = fields[0]}
                  {@const emailField = fields.find(f => f.type === 'email')}
                  <div
                    class="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition cursor-grab select-none active:cursor-grabbing hover:border-brand-200 animate-fade-in"
                    draggable="true"
                    ondragstart={() => onDragStartCard(row.id)}
                  >
                    <p class="text-[10px] text-slate-400 font-semibold mb-1">
                      {new Date(row.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <h4 class="text-sm font-extrabold text-[color:var(--ink)] truncate mb-1">
                      {labelField ? formatValue(row.values[labelField.key]) : "Réponse #" + row.id.slice(0, 5)}
                    </h4>
                    {#if emailField && row.values[emailField.key]}
                      <p class="text-xs text-[color:var(--muted)] truncate mb-2">{row.values[emailField.key]}</p>
                    {/if}
                    <div class="flex justify-end border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        class="text-[10px] font-bold text-brand hover:underline"
                        onclick={() => {
                          selectedRowIndex = rows.findIndex(r => r.id === row.id);
                          activeView = "fiches";
                        }}
                      >
                        Consulter →
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if activeView === "fiches"}
    <!-- --- Fiches view with Details and PDF generator --- -->
    {#if rows.length === 0}
      <p class="text-center py-12 text-slate-400">Aucune réponse à afficher.</p>
    {:else}
      <!-- Split-screen for admin screen, full print block in print mode -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        <!-- Sidebar: list of submissions -->
        <div class="no-print flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
          {#each rows as r, index}
            {@const labelField = fields[0]}
            <button
              type="button"
              class="w-full text-left bg-white border rounded-xl p-3.5 shadow-sm transition hover:border-brand-300 text-[color:var(--ink)] cursor-pointer select-none"
              class:border-brand-500={selectedRowIndex === index}
              class:ring-2={selectedRowIndex === index}
              class:ring-brand-100={selectedRowIndex === index}
              onclick={() => selectedRowIndex = index}
            >
              <div class="flex justify-between items-center mb-1">
                <span class="text-[10px] font-semibold text-slate-400">
                  {new Date(r.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span class="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">#{r.id.slice(0, 5)}</span>
              </div>
              <p class="text-xs font-black truncate">
                {labelField ? formatValue(r.values[labelField.key]) : "Soumission anonyme"}
              </p>
            </button>
          {/each}
        </div>

        <!-- Right Side: Details panel of active response -->
        <div class="md:col-span-2 flex flex-col gap-4">
          {#if selectedRow}
            <!-- Actions banner -->
            <div class="no-print flex items-center justify-between bg-white p-4 border rounded-2xl shadow-sm">
              <span class="text-xs text-slate-500 font-semibold">Consulter le dossier individuel</span>
              <button
                type="button"
                class="btn-primary text-xs flex items-center gap-1.5 !py-2"
                onclick={exportActiveRowPDF}
              >
                <IconDownload size={14} /> Exporter en PDF (Imprimer)
              </button>
            </div>

            <!-- Print content wrapper -->
            <div id="print-area" class="bg-white border border-[color:var(--line)] rounded-2xl p-6 md:p-8 shadow-md">
              <!-- Printable Header -->
              <div class="flex items-center gap-4 border-b pb-6 mb-6">
                <div class="bg-brand-500 text-white p-3 rounded-2xl shadow-md shrink-0">
                  <IconLeaf size={28} weight="fill" />
                </div>
                <div>
                  <h2 class="text-lg font-black uppercase tracking-wider text-brand-600 mb-0.5">OpenForms Dossier</h2>
                  <h1 class="text-xl font-bold text-[color:var(--ink)] leading-tight">{title}</h1>
                  <p class="text-xs text-[color:var(--muted)] font-medium mt-1">
                    Réponse ID : <span class="font-mono">{selectedRow.id}</span> · Soumis le : {new Date(selectedRow.submittedAt).toLocaleString("fr-FR")}
                  </p>
                </div>
              </div>

              <!-- Responses content list -->
              <div class="space-y-5">
                {#each fields as field}
                  {#if field.type !== "section"}
                    {@const val = selectedRow.values[field.key]}
                    <div class="border-b border-slate-100 pb-3 break-inside-avoid">
                      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{field.label}</h4>
                      
                      {#if field.type === "signature"}
                        {#if val && typeof val === "string" && val.startsWith("data:image/")}
                          <div class="mt-2 border border-slate-200 rounded-xl p-2 bg-slate-50 w-fit max-w-[280px]">
                            <img src={val} alt="Signature numérique" class="max-h-20 object-contain h-auto" />
                          </div>
                        {:else}
                          <p class="text-xs italic text-slate-400">— Aucune signature —</p>
                        {/if}
                      {:else if field.type === "file"}
                        {#if Array.isArray(val)}
                          <div class="flex flex-col gap-1.5 mt-1.5">
                            {#each val as filename}
                              <span class="inline-flex items-center gap-1.5 text-xs text-brand font-semibold">
                                <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                {filename}
                              </span>
                            {/each}
                          </div>
                        {:else}
                          <p class="text-xs text-slate-500">{formatValue(val)}</p>
                        {/if}
                      {:else if field.type === "stripe_payment"}
                        {#if val && typeof val === "object" && (val as any).paid}
                          <div class="flex items-center gap-2 text-green-700 bg-green-50/50 border border-green-200 rounded-xl p-3 w-fit text-xs font-bold mt-1">
                            <IconCheck size={14} weight="bold" />
                            <span>Paiement validé : {(val as any).amount} € (Trans: {(val as any).transactionId})</span>
                          </div>
                        {:else}
                          <p class="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100 p-2 rounded-lg w-fit">Non réglé</p>
                        {/if}
                      {:else}
                        <p class="text-sm font-medium text-[color:var(--ink)] leading-relaxed whitespace-pre-line">
                          {formatValue(val)}
                        </p>
                      {/if}
                    </div>
                  {:else}
                    <!-- Section header visual block -->
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-6 mb-4 break-inside-avoid">
                      <h3 class="text-sm font-black text-indigo-700 uppercase tracking-wider">{field.label}</h3>
                      {#if field.description}
                        <p class="text-2xs text-slate-500 mt-0.5">{field.description}</p>
                      {/if}
                    </div>
                  {/if}
                {/each}

                <!-- Internals Metadata (Admin Notes / Calculation formula) -->
                {#if metaColumns.length > 0}
                  <div class="mt-8 border-t-2 border-dashed pt-5 break-inside-avoid">
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Métadonnées Administrateur</h3>
                    <div class="grid grid-cols-2 gap-4">
                      {#each metaColumns as col}
                        <div class="bg-slate-50/50 border rounded-xl p-3">
                          <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{col.label}</h4>
                          <p class="text-xs font-semibold text-[color:var(--ink)]">
                            {formatValue(selectedRow.metadata[col.key])}
                          </p>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style lang="scss">
  @media print {
    // Hide everything except print area
    :global(body) {
      background: white !important;
    }
    :global(.no-print), :global(nav), :global(header) {
      display: none !important;
    }
    #print-area {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
  }
</style>
