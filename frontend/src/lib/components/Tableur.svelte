<script lang="ts">
  import { onMount } from "svelte";
  import { JUSTIFICATION_SUFFIX, type FieldDefinition, type FieldOption, type MetaColumn, type ResponseRow } from "../types.ts";
  import { api } from "../api/client.ts";
  import { invalidateResponsesCache } from "../responsesCache.ts";
  import { evaluateRowFormula, evaluateAggregate } from "../formulaEngine.ts";
  import MultiSelectFilter from "./MultiSelectFilter.svelte";
  import DataExportMenu from "./DataExportMenu.svelte";
  import { toasts } from "../stores/toast.svelte.ts";
  import { askConfirm, askPrompt } from "../stores/dialog.svelte.ts";
  import { sanitizeFilename, type DataExportOptions, type DataFormat } from "../dataExport.ts";
  import {
    IconSearch,
    IconSortAsc,
    IconSortDesc,
    IconPlus,
    IconTrash,
    IconClose,
    IconImport,
    IconDownload,
    IconFormula,
  } from "../icons.ts";

  let {
    formId,
    formTitle = "Réponses",
    fields = [] as FieldDefinition[],
    metaColumns = $bindable([] as MetaColumn[]),
    rows = $bindable([] as ResponseRow[]),
    canEdit = false,
    onMetaColumnsChange,
  }: {
    formId: string;
    formTitle?: string;
    fields: FieldDefinition[];
    metaColumns: MetaColumn[];
    rows: ResponseRow[];
    canEdit?: boolean;
    onMetaColumnsChange?: (cols: MetaColumn[]) => void;
  } = $props();

  interface Column {
    key: string;
    label: string;
    source: "field" | "meta";
    kind?: string;
    formula?: string;
    editable: boolean;
    numeric: boolean;
    fieldType?: string;
    /** "single" pour radio/select, "multi" pour checkbox : pilote l'éditeur et le filtre en liste déroulante. */
    choiceType?: "single" | "multi";
    options?: FieldOption[];
  }

  // Colonnes = champs du formulaire + colonnes de métadonnées.
  let columns = $derived<Column[]>([
    ...fields
      .filter((f) => f.type !== "file")
      .flatMap((f): Column[] => {
        const choiceType: Column["choiceType"] =
          f.type === "checkbox" ? "multi" : f.type === "radio" || f.type === "select" ? "single" : undefined;
        const col: Column = {
          key: f.key,
          label: f.label,
          source: "field" as const,
          editable: canEdit && f.type !== "grid",
          numeric: f.type === "number",
          fieldType: f.type,
          choiceType,
          options: choiceType ? f.options : undefined,
        };
        if (!f.requireJustification) return [col];
        return [
          col,
          {
            key: `${f.key}${JUSTIFICATION_SUFFIX}`,
            label: `${f.label} (justification)`,
            source: "field" as const,
            editable: false,
            numeric: false,
          },
        ];
      }),
    ...metaColumns.map((m) => ({
      key: m.key,
      label: m.label,
      source: "meta" as const,
      kind: m.kind,
      formula: m.formula,
      editable: canEdit && m.kind !== "formula",
      numeric: m.kind === "number",
    })),
  ]);

  // --- État interactif ---
  let searchQuery = $state("");
  // La recherche filtre sur toutes les colonnes × toutes les lignes : avec beaucoup
  // de réponses, refiltrer à chaque frappe suffit à saccader la saisie. On débounce
  // la valeur réellement utilisée par `viewRows` tout en gardant l'input réactif.
  let debouncedSearchQuery = $state("");
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const q = searchQuery;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => (debouncedSearchQuery = q), 150);
    return () => clearTimeout(searchDebounceTimer);
  });
  // Filtres colonnes texte/nombre (sous-chaîne) et filtres colonnes à choix (valeurs sélectionnées).
  let textFilters = $state<Record<string, string>>({});
  // Même débounce que la recherche globale : filtrer une colonne texte parcourt
  // aussi toutes les lignes à chaque frappe.
  let debouncedTextFilters = $state<Record<string, string>>({});
  let textFiltersDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snapshot = { ...textFilters };
    clearTimeout(textFiltersDebounceTimer);
    textFiltersDebounceTimer = setTimeout(() => (debouncedTextFilters = snapshot), 150);
    return () => clearTimeout(textFiltersDebounceTimer);
  });
  let choiceFilters = $state<Record<string, string[]>>({});
  let sortKey = $state("");
  let sortDir = $state<"asc" | "desc" | null>(null);
  let editing = $state<{ rowId: string; key: string } | null>(null);
  let editValue = $state("");
  let editValues = $state<string[]>([]);
  let aggregates = $state<Record<string, string>>({}); // colKey -> "SUM" | "AVG" | ...
  let busy = $state(false);
  let viewMode = $state<"table" | "cards">("table");
  let actionsMenuOpen = $state(false);

  onMount(() => {
    if (window.innerWidth < 768) {
      viewMode = "cards";
    }
  });

  // --- Virtualisation des lignes du tableau ---
  // Avec beaucoup de réponses, rendre toutes les <tr>/<td> dans le DOM (potentiellement
  // des dizaines de milliers de cellules) rend l'interface très lente au chargement,
  // au tri comme au scroll. On ne monte que les lignes visibles dans le viewport
  // (+ une marge de sécurité), et on comble le reste avec deux lignes "espaceurs"
  // dont la hauteur reproduit celle des lignes non rendues.
  const ROW_HEIGHT = 34; // doit rester cohérent avec la règle `td { height: 34px }` plus bas
  const OVERSCAN = 12;
  let tableWrapperEl = $state<HTMLDivElement>();
  let viewportHeight = $state(600);
  let scrollTop = $state(0);
  let scrollRaf = 0;

  function handleScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollTop = el.scrollTop;
      scrollRaf = 0;
    });
  }

  let totalCols = $derived(columns.length + 1 + (canEdit ? 1 : 0));

  // --- Vue Cartes : pagination simple (chargement progressif) ---
  const CARDS_PAGE = 30;
  let cardsLimit = $state(CARDS_PAGE);

  // Correspondance valeur -> intitulé pour les champs à options (radio, checkbox, select).
  let optionLabels = $derived<Record<string, Record<string, string>>>(
    Object.fromEntries(
      fields
        .filter((f) => f.options?.length)
        .map((f) => [f.key, Object.fromEntries(f.options!.map((o) => [o.value, o.label]))]),
    ),
  );

  // Valeur brute d'une cellule (champ, méta ou formule calculée par ligne).
  function rawValue(row: ResponseRow, col: Column): unknown {
    if (col.source === "field") return row.values[col.key];
    if (col.kind === "formula" && col.formula) {
      return evaluateRowFormula(col.formula, { ...row.values, ...row.metadata });
    }
    return row.metadata[col.key];
  }

  function formatCell(value: unknown, labels?: Record<string, string>): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return value.map((v) => {
        if (typeof v === "object") return (v as any).originalName ?? JSON.stringify(v);
        const s = String(v);
        if (s.startsWith("__other__:")) return s.slice(10);
        if (s === "__other__") return "Autre";
        return labels?.[s] ?? s;
      }).join(", ");
    }
    if (typeof value === "object") return JSON.stringify(value);
    const s = String(value);
    if (s.startsWith("__other__:")) return s.slice(10);
    if (s === "__other__") return "Autre";
    return labels?.[s] ?? s;
  }

  // Valeur affichée d'une cellule : les valeurs d'options sont remplacées par leur intitulé.
  function displayCell(row: ResponseRow, col: Column): string {
    return formatCell(rawValue(row, col), optionLabels[col.key]);
  }

  // --- Filtrage + tri (réactif) ---
  let viewRows = $derived.by(() => {
    let data = [...rows];
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) {
      data = data.filter((row) =>
        columns.some((c) => displayCell(row, c).toLowerCase().includes(q)),
      );
    }
    for (const col of columns) {
      if (col.choiceType) {
        const sel = choiceFilters[col.key];
        if (!sel || sel.length === 0) continue;
        data = data.filter((row) => {
          const raw = rawValue(row, col);
          const vals = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
          return vals.some((v) => sel.includes(v));
        });
      } else {
        const f = (debouncedTextFilters[col.key] ?? "").trim().toLowerCase();
        if (!f) continue;
        data = data.filter((row) => displayCell(row, col).toLowerCase().includes(f));
      }
    }
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        data.sort((a, b) => {
          const va = rawValue(a, col);
          const vb = rawValue(b, col);
          const na = Number(va);
          const nb = Number(vb);
          let cmp: number;
          if (Number.isFinite(na) && Number.isFinite(nb)) cmp = na - nb;
          else cmp = displayCell(a, col).localeCompare(displayCell(b, col));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return data;
  });

  // Fenêtre de lignes réellement montées dans le DOM (voir la note "Virtualisation" plus haut).
  let startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  let visibleCount = $derived(Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2);
  let endIndex = $derived(Math.min(viewRows.length, startIndex + visibleCount));
  let visibleRows = $derived(viewRows.slice(startIndex, endIndex));
  let topPad = $derived(startIndex * ROW_HEIGHT);
  let bottomPad = $derived(Math.max(0, (viewRows.length - endIndex) * ROW_HEIGHT));

  // Recale le scroll (et donc la fenêtre visible) quand le filtrage change le nombre
  // de lignes, pour éviter de rester bloqué sur une plage vide hors bornes.
  $effect(() => {
    void viewRows.length;
    if (tableWrapperEl && tableWrapperEl.scrollTop !== scrollTop) {
      scrollTop = tableWrapperEl.scrollTop;
    }
  });

  // Réinitialise la pagination de la vue Cartes dès que le jeu de lignes filtré change.
  $effect(() => {
    void viewRows;
    cardsLimit = CARDS_PAGE;
  });

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc";
      if (sortDir === null) sortKey = "";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  // --- Édition d'une cellule (autosave) ---
  function startEdit(row: ResponseRow, col: Column) {
    if (!col.editable) return;
    editing = { rowId: row.id, key: col.key };
    if (col.choiceType === "multi") {
      const raw = rawValue(row, col);
      editValues = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
    } else if (col.choiceType === "single") {
      const raw = rawValue(row, col);
      editValue = raw == null ? "" : String(raw);
    } else {
      editValue = displayCell(row, col);
    }
  }

  function toggleEditValue(value: string) {
    editValues = editValues.includes(value) ? editValues.filter((v) => v !== value) : [...editValues, value];
  }

  function cancelEdit() {
    editing = null;
  }

  async function commitEdit() {
    if (!editing) return;
    const col = columns.find((c) => c.key === editing!.key);
    const row = rows.find((r) => r.id === editing!.rowId);
    const target = editing;
    editing = null;
    if (!col || !row) return;

    let value: unknown;
    if (col.choiceType === "multi") {
      value = [...editValues];
    } else {
      value = editValue;
      if (col.numeric) value = editValue === "" ? null : Number(editValue);
    }

    // Mise à jour optimiste locale.
    if (col.source === "field") row.values[col.key] = value;
    else row.metadata[col.key] = value;
    rows = [...rows];

    try {
      await api.updateCell(target.rowId, col.source === "field" ? "field" : "meta", col.key, value);
      invalidateResponsesCache(formId);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la sauvegarde.");
    }
  }

  function editKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") editing = null;
  }

  // Action de focus automatique à l'apparition de l'input/select.
  function focus(node: HTMLElement) {
    node.focus();
    (node as HTMLInputElement).select?.();
  }

  // --- Lignes : ajout / suppression ---
  async function addRow() {
    busy = true;
    try {
      const res = await api.addResponseRow(formId);
      rows = [res.row, ...rows];
      invalidateResponsesCache(formId);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de l'ajout.");
    } finally {
      busy = false;
    }
  }

  async function deleteRow(id: string) {
    const ok = await askConfirm({
      title: "Supprimer cette réponse ?",
      message: "La ligne et ses valeurs seront définitivement supprimées.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteResponse(id);
      rows = rows.filter((r) => r.id !== id);
      invalidateResponsesCache(formId);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "Échec de la suppression.");
    }
  }

  // --- Colonnes de métadonnées : ajout / suppression ---
  async function addColumn() {
    const label = await askPrompt({
      title: "Nouvelle colonne",
      message: "Une colonne de métadonnées : son contenu n'est visible que des éditeurs.",
      label: "Nom de la colonne",
      placeholder: "Ex : statut de traitement",
      confirmLabel: "Ajouter",
      maxLength: 200,
    });
    if (!label) return;
    const col: MetaColumn = { key: `meta_${Date.now().toString(36)}`, label, kind: "text" };
    metaColumns = [...metaColumns, col];
    onMetaColumnsChange?.(metaColumns);
  }

  async function removeColumn(key: string) {
    const ok = await askConfirm({
      title: "Retirer cette colonne ?",
      message: "Les valeurs qu'elle contient ne seront plus affichées.",
      confirmLabel: "Retirer",
      danger: true,
    });
    if (!ok) return;
    metaColumns = metaColumns.filter((c) => c.key !== key);
    onMetaColumnsChange?.(metaColumns);
  }

  // --- Agrégations (pied de colonne) ---
  function aggregateValue(col: Column): string {
    const fn = aggregates[col.key];
    if (!fn) return "";
    const asRows = viewRows.map((r) => ({ [col.key]: Number(rawValue(r, col)) }));
    return evaluateAggregate(`${fn}(${col.key})`, asRows);
  }

  // --- Export des données (Excel / CSV / JSON) ---
  // La génération vit dans $lib/dataExport.ts, partagée avec la page
  // Statistiques : mêmes colonnes, mêmes valeurs, même bloc de contexte.
  function buildDataExport(format: DataFormat): DataExportOptions {
    const exportColumns = [
      { key: "__submittedAt", label: "Soumis le", kind: "date" as const },
      ...columns.map((c) => ({
        key: c.key,
        label: c.label,
        kind: (c.kind === "number" || c.kind === "formula" ? "number" : "text") as
          | "number"
          | "text",
      })),
    ];

    const exportRows = viewRows.map((row) => {
      const record: Record<string, unknown> = {
        __submittedAt: new Date(row.submittedAt).toLocaleString("fr-FR"),
      };
      for (const c of columns) record[c.key] = displayCell(row, c);
      return record;
    });

    const activeFilters: string[] = [];
    if (debouncedSearchQuery) activeFilters.push(`recherche « ${debouncedSearchQuery} »`);
    for (const [key, value] of Object.entries(debouncedTextFilters)) {
      if (value) activeFilters.push(`${columnLabel(key)} contient « ${value} »`);
    }
    for (const [key, values] of Object.entries(choiceFilters)) {
      if (values?.length) activeFilters.push(`${columnLabel(key)} = ${values.join(", ")}`);
    }

    return {
      filename: `${sanitizeFilename(formTitle)}_reponses`,
      sheetName: "Réponses",
      columns: exportColumns,
      rows: exportRows,
      format,
      meta: [
        { label: "Formulaire", value: formTitle },
        { label: "Lignes exportées", value: String(viewRows.length) },
        { label: "Lignes au total", value: String(rows.length) },
        { label: "Date d'export", value: new Date().toLocaleString("fr-FR") },
        {
          label: "Filtres actifs",
          value: activeFilters.length > 0 ? activeFilters.join(" ; ") : "aucun",
        },
      ],
      includeMeta: format !== "csv",
    };
  }

  function columnLabel(key: string): string {
    return columns.find((c) => c.key === key)?.label ?? key;
  }

  // --- Import XLSX / CSV : met à jour les cellules par correspondance de colonnes ---
  async function importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    busy = true;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const buf = await file.arrayBuffer();
      if (file.name.endsWith(".csv")) await wb.csv.read(new Blob([buf]).stream() as any);
      else await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      const headerRow = ws.getRow(1);
      const headerToCol: Record<number, Column> = {};
      headerRow.eachCell((cell, colNumber) => {
        const label = String(cell.value ?? "").trim();
        const col = columns.find((c) => c.label === label && c.editable);
        if (col) headerToCol[colNumber] = col;
      });

      let updates = 0;
      const dataRows = viewRows;
      for (let i = 2; i <= ws.rowCount; i++) {
        const target = dataRows[i - 2];
        if (!target) break;
        const excelRow = ws.getRow(i);
        for (const [colNumber, col] of Object.entries(headerToCol)) {
          const cellVal = excelRow.getCell(Number(colNumber)).value;
          let value: unknown = col.numeric ? Number(cellVal) : String(cellVal ?? "");
          if (!col.numeric) {
            // Les exports contiennent l'intitulé des options : on stocke la valeur correspondante.
            const match = Object.entries(optionLabels[col.key] ?? {}).find(([, label]) => label === value);
            if (match) value = match[0];
          }
          if (col.source === "field") target.values[col.key] = value;
          else target.metadata[col.key] = value;
          await api.updateCell(target.id, col.source === "field" ? "field" : "meta", col.key, value);
          updates++;
        }
      }
      rows = [...rows];
      if (updates > 0) invalidateResponsesCache(formId);
      toasts.success(`Import terminé : ${updates} cellule(s) mise(s) à jour.`);
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      busy = false;
      input.value = "";
    }
  }
</script>

<div class="tableur-container">
  <!-- Toolbar responsive -->
  <div class="toolbar flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3 bg-slate-50 border border-[color:var(--line)] border-b-0 rounded-t-2xl">
    <div class="search-box flex-1 max-w-sm">
      <span class="search-ico"><IconSearch size={16} /></span>
      <input type="text" placeholder="Rechercher dans les réponses…" bind:value={searchQuery} class="search-input w-full" />
    </div>
    
    <div class="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
      <!-- Toggle mode d'affichage -->
      <div class="flex border border-slate-200 rounded-xl p-0.5 bg-white shrink-0">
        <button 
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 select-none"
          class:bg-brand={viewMode === "table"}
          class:text-white={viewMode === "table"}
          class:text-slate-500={viewMode !== "table"}
          onclick={() => viewMode = "table"}
        >
          Tableur
        </button>
        <button 
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 select-none"
          class:bg-brand={viewMode === "cards"}
          class:text-white={viewMode === "cards"}
          class:text-slate-500={viewMode !== "cards"}
          onclick={() => viewMode = "cards"}
        >
          Cartes
        </button>
      </div>

      <!-- Actions de modification (desktop inline, mobile menu) -->
      <div class="flex items-center gap-1.5">
        <!-- Actions PC -->
        <div class="hidden md:flex items-center gap-1.5">
          {#if canEdit}
            <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={addRow} disabled={busy} type="button"><IconPlus size={14} weight="bold" /> Ligne</button>
            <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={addColumn} type="button"><IconPlus size={14} weight="bold" /> Colonne</button>
            <label class="btn-secondary cursor-pointer !px-3 !py-1.5 text-xs">
              <IconImport size={15} /> Importer
              <input type="file" accept=".xlsx,.csv" class="hidden" onchange={importFile} />
            </label>
          {/if}
          <DataExportMenu build={buildDataExport} rowCount={viewRows.length} />
        </div>

        <!-- Actions Mobile Dropdown -->
        <div class="relative block md:hidden">
          <button 
            class="btn-secondary !px-3 !py-1.5 text-xs" 
            onclick={() => actionsMenuOpen = !actionsMenuOpen}
            type="button"
          >
            Actions
          </button>
          
          {#if actionsMenuOpen}
            <!-- Overlay to close -->
            <div class="fixed inset-0 z-30" onclick={() => actionsMenuOpen = false} role="none"></div>
            
            <div class="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[color:var(--line)] bg-white p-1.5 shadow-xl z-40 text-left">
              {#if canEdit}
                <button 
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                  onclick={() => { actionsMenuOpen = false; addRow(); }}
                >
                  <IconPlus size={14} /> Ajouter une ligne
                </button>
                <button 
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                  onclick={() => { actionsMenuOpen = false; addColumn(); }}
                >
                  <IconPlus size={14} /> Ajouter une colonne
                </button>
                <label class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 cursor-pointer transition">
                  <IconImport size={14} /> Importer XLSX/CSV
                  <input type="file" accept=".xlsx,.csv" class="hidden" onchange={(e) => { actionsMenuOpen = false; importFile(e); }} />
                </label>
                <hr class="my-1 border-slate-100" />
              {/if}
              <div class="px-1 py-1">
                <DataExportMenu build={buildDataExport} rowCount={viewRows.length} />
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Vue Tableur classique -->
  <div
    class="table-wrapper"
    class:hidden={viewMode !== "table"}
    bind:this={tableWrapperEl}
    bind:clientHeight={viewportHeight}
    onscroll={handleScroll}
  >
    <table class="custom-table">
      <thead>
        <tr>
          <th class="idx">#</th>
          {#each columns as col (col.key)}
            <th class="clickable-header">
              <div class="th-inner">
                <button class="th-sort" onclick={() => toggleSort(col.key)} type="button">
                  <span>{col.label}</span>
                  {#if sortKey === col.key && sortDir === "asc"}<IconSortAsc size={14} />{:else if sortKey === col.key && sortDir === "desc"}<IconSortDesc size={14} />{/if}
                  {#if col.kind === "formula"}<span class="fx"><IconFormula size={12} /></span>{/if}
                </button>
                {#if col.source === "meta" && canEdit}
                  <button class="col-del" title="Retirer la colonne" onclick={() => removeColumn(col.key)} type="button" aria-label="Retirer la colonne"><IconClose size={13} /></button>
                {/if}
              </div>
              {#if col.choiceType}
                <div class="col-filter-msf">
                  <MultiSelectFilter
                    options={col.options ?? []}
                    selected={choiceFilters[col.key] ?? []}
                    onChange={(vals) => (choiceFilters[col.key] = vals)}
                    label="Filtrer"
                  />
                </div>
              {:else}
                <input class="col-filter" placeholder="filtrer…" bind:value={textFilters[col.key]} />
              {/if}
            </th>
          {/each}
          <th class="meta-th">Soumis le</th>
          {#if canEdit}<th class="meta-th"></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#if topPad > 0}
          <tr class="virt-spacer" aria-hidden="true"><td style="height:{topPad}px" colspan={totalCols}></td></tr>
        {/if}
        {#each visibleRows as row, i (row.id)}
          <tr>
            <td class="idx">{startIndex + i + 1}</td>
            {#each columns as col (col.key)}
              <td
                class:editable={col.editable}
                ondblclick={() => startEdit(row, col)}
                title={col.editable ? "Double-cliquez pour modifier" : ""}
              >
                {#if editing?.rowId === row.id && editing?.key === col.key}
                  {#if col.choiceType === "single"}
                    <select
                      class="cell-editor"
                      value={editValue}
                      onchange={(e) => { editValue = (e.target as HTMLSelectElement).value; commitEdit(); }}
                      use:focus
                    >
                      <option value="">—</option>
                      {#if editValue && !(col.options ?? []).some((o) => o.value === editValue)}
                        <option value={editValue}>{formatCell(editValue)}</option>
                      {/if}
                      {#each col.options ?? [] as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </select>
                  {:else if col.choiceType === "multi"}
                    <div class="cell-editor cell-editor-multi">
                      <div class="multi-list">
                        {#each col.options ?? [] as opt}
                          <label class="multi-item">
                            <input type="checkbox" checked={editValues.includes(opt.value)} onchange={() => toggleEditValue(opt.value)} />
                            <span>{opt.label}</span>
                          </label>
                        {/each}
                      </div>
                      <div class="multi-actions">
                        <button type="button" class="btn-primary !py-0.5 !px-2 text-xs" onclick={commitEdit}>OK</button>
                        <button type="button" class="btn-secondary !py-0.5 !px-2 text-xs" onclick={cancelEdit}>Annuler</button>
                      </div>
                    </div>
                  {:else}
                    <input
                      class="cell-editor"
                      type={col.numeric ? "number" : "text"}
                      bind:value={editValue}
                      onblur={commitEdit}
                      onkeydown={editKeydown}
                      use:focus
                    />
                  {/if}
                {:else if col.fieldType === "signature" && typeof rawValue(row, col) === "string" && (rawValue(row, col) as string).startsWith("data:image/")}
                  <img src={rawValue(row, col) as string} alt="Signature" class="sig-thumb" />
                {:else}
                  <span class="cell-content">{displayCell(row, col)}</span>
                {/if}
              </td>
            {/each}
            <td class="meta-td">{new Date(row.submittedAt).toLocaleDateString()}</td>
            {#if canEdit}
              <td class="meta-td">
                <button class="row-del" onclick={() => deleteRow(row.id)} type="button" title="Supprimer" aria-label="Supprimer la ligne"><IconTrash size={15} /></button>
              </td>
            {/if}
          </tr>
        {/each}
        {#if bottomPad > 0}
          <tr class="virt-spacer" aria-hidden="true"><td style="height:{bottomPad}px" colspan={totalCols}></td></tr>
        {/if}
        {#if viewRows.length === 0}
          <tr><td class="empty" colspan={columns.length + 2}>Aucune réponse.</td></tr>
        {/if}
      </tbody>
      <tfoot>
        <tr>
          <td class="idx"></td>
          {#each columns as col (col.key)}
            <td class="agg-cell">
              {#if col.numeric}
                <select bind:value={aggregates[col.key]} class="agg-select">
                  <option value="">—</option>
                  <option value="SUM">Σ Somme</option>
                  <option value="AVG">x̄ Moyenne</option>
                  <option value="MIN">Min</option>
                  <option value="MAX">Max</option>
                  <option value="MEDIAN">Médiane</option>
                  <option value="COUNT">Nombre</option>
                </select>
                <span class="agg-val">{aggregateValue(col)}</span>
              {/if}
            </td>
          {/each}
          <td class="meta-td">{viewRows.length} ligne(s)</td>
          {#if canEdit}<td></td>{/if}
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Vue par Cartes (Mobile) -->
  {#if viewMode === "cards"}
    <div class="space-y-4 mt-4">
      {#each viewRows.slice(0, cardsLimit) as row, i (row.id)}
        <div class="card border border-[color:var(--line)] bg-white rounded-2xl p-5 shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <span class="text-xs font-bold text-brand uppercase tracking-wider">Réponse #{viewRows.length - i}</span>
            <span class="text-xs font-medium text-slate-400">{new Date(row.submittedAt).toLocaleString()}</span>
          </div>
          
          <div class="space-y-3 mb-4">
            {#each columns as col}
              <div class="flex flex-col border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{col.label}</span>
                {#if editing?.rowId === row.id && editing?.key === col.key}
                  {#if col.choiceType === "single"}
                    <div class="flex items-center gap-1.5 mt-1">
                      <select class="input !py-1.5 text-xs font-semibold flex-1" bind:value={editValue} use:focus>
                        <option value="">—</option>
                        {#if editValue && !(col.options ?? []).some((o) => o.value === editValue)}
                          <option value={editValue}>{formatCell(editValue)}</option>
                        {/if}
                        {#each col.options ?? [] as opt}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </select>
                      <button class="btn-primary !px-3 !py-1.5 text-xs" onclick={commitEdit}>OK</button>
                      <button class="btn-secondary !px-3 !py-1.5 text-xs text-slate-500" onclick={cancelEdit}>Fermer</button>
                    </div>
                  {:else if col.choiceType === "multi"}
                    <div class="mt-1 space-y-2">
                      <div class="multi-list multi-list-card">
                        {#each col.options ?? [] as opt}
                          <label class="multi-item">
                            <input type="checkbox" checked={editValues.includes(opt.value)} onchange={() => toggleEditValue(opt.value)} />
                            <span>{opt.label}</span>
                          </label>
                        {/each}
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button class="btn-primary !px-3 !py-1.5 text-xs" onclick={commitEdit}>OK</button>
                        <button class="btn-secondary !px-3 !py-1.5 text-xs text-slate-500" onclick={cancelEdit}>Fermer</button>
                      </div>
                    </div>
                  {:else}
                    <div class="flex items-center gap-1.5 mt-1">
                      <input
                        class="input !py-1.5 text-xs font-semibold"
                        type={col.numeric ? "number" : "text"}
                        bind:value={editValue}
                        onkeydown={editKeydown}
                        use:focus
                      />
                      <button class="btn-primary !px-3 !py-1.5 text-xs" onclick={commitEdit}>OK</button>
                      <button class="btn-secondary !px-3 !py-1.5 text-xs text-slate-500" onclick={cancelEdit}>Fermer</button>
                    </div>
                  {/if}
                {:else if col.fieldType === "signature"}
                  {@const sigVal = rawValue(row, col)}
                  {#if sigVal && typeof sigVal === "string" && sigVal.startsWith("data:image/")}
                    <div class="mt-1 border border-slate-200 rounded-lg p-1.5 bg-slate-50 w-fit max-w-[220px]">
                      <img src={sigVal} alt="Signature" class="max-h-16 object-contain" />
                    </div>
                  {:else}
                    <span class="text-xs italic text-slate-400">— Aucune signature-</span>
                  {/if}
                {:else}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="text-sm text-[color:var(--ink)] font-semibold min-h-[1.5rem] py-1 px-1.5 rounded transition hover:bg-brand-50/50 cursor-pointer"
                    onclick={() => { if (col.editable) startEdit(row, col); }}
                    title={col.editable ? "Cliquez pour modifier" : ""}
                  >
                    {displayCell(row, col) || "—"}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          {#if canEdit}
            <div class="flex justify-end pt-3 border-t border-slate-100">
              <button 
                class="btn-text !py-1 text-xs !text-[color:var(--danger)] flex items-center gap-1.5"
                onclick={() => deleteRow(row.id)}
                type="button"
              >
                <IconTrash size={15} /> Supprimer
              </button>
            </div>
          {/if}
        </div>
      {/each}
      {#if viewRows.length === 0}
        <div class="text-center text-slate-400 p-12 bg-white rounded-2xl border border-[color:var(--line)]">Aucune réponse.</div>
      {/if}
      {#if cardsLimit < viewRows.length}
        <button type="button" class="btn-secondary w-full !py-2.5 text-xs" onclick={() => (cardsLimit += CARDS_PAGE)}>
          Afficher plus ({viewRows.length - cardsLimit} restantes)
        </button>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  @use "../scss/main" as m;

  .tableur-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    font-family: "Inter", "Segoe UI", sans-serif;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: m.$gray-bg;
    border: 1px solid m.$gray-border;
    border-bottom: none;
    border-radius: m.$radius m.$radius 0 0;
    .search-box {
      position: relative;
      .search-ico {
        position: absolute;
        left: 0.6rem;
        top: 50%;
        transform: translateY(-50%);
        color: #5f6368;
        display: flex;
      }
    }
    .search-input {
      padding: 0.45rem 0.8rem 0.45rem 2rem;
      border: 1px solid m.$gray-border;
      border-radius: 0.5rem;
      width: 280px;
      font-size: 0.8rem;
      &:focus {
        @include m.focus-ring;
      }
    }
  }
  .table-wrapper {
    overflow: auto;
    max-height: 70vh;
    border: 1px solid m.$gray-border;
    border-radius: 0 0 m.$radius m.$radius;
    @include m.subtle-scroll;
  }
  .custom-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: white;
    font-size: 0.82rem;

    th,
    td {
      border-right: 1px solid m.$gray-border;
      border-bottom: 1px solid m.$gray-border;
      padding: 0.4rem 0.6rem;
      text-align: left;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #f9fafb;
      vertical-align: top;
    }
    .th-inner {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .th-sort {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: none;
      border: none;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.82rem;
      padding: 0;
      flex: 1;
      text-align: left;
      color: var(--ink);
    }
    .fx {
      display: inline-flex;
      align-items: center;
      color: white;
      background: m.$brand;
      border-radius: 3px;
      padding: 1px 3px;
    }
    .col-del,
    .row-del {
      background: none;
      border: none;
      cursor: pointer;
      color: #ef4444;
      opacity: 0.6;
      &:hover {
        opacity: 1;
      }
    }
    .col-filter {
      margin-top: 0.25rem;
      width: 100%;
      border: 1px solid m.$gray-border;
      border-radius: 3px;
      font-size: 0.7rem;
      padding: 0.15rem 0.3rem;
      font-weight: normal;
    }
    .col-filter-msf {
      margin-top: 0.25rem;
    }
    .idx {
      background: #f9fafb;
      color: #9ca3af;
      text-align: center;
      width: 40px;
      font-size: 0.7rem;
    }
    td {
      min-width: 120px;
      height: 34px;
      position: relative;
      max-width: 320px;
      &.editable {
        cursor: cell;
      }
    }
    .cell-content {
      @include m.truncate;
      display: block;
    }
    .cell-editor {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 2px solid m.$brand;
      padding: 0.4rem 0.6rem;
      box-sizing: border-box;
      outline: none;
      font-size: 0.82rem;
    }
    .cell-editor-multi {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      background: white;
      height: auto;
      min-height: 100%;
      z-index: 5;
      box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.15);
    }
    .sig-thumb {
      max-height: 28px;
      max-width: 100%;
      object-fit: contain;
      display: block;
      background: white;
      border: 1px solid m.$gray-border;
      border-radius: 4px;
      padding: 2px;
    }
    tbody tr:hover td:not(.idx) {
      background: #f0fdf4;
    }
    .meta-th,
    .meta-td {
      background: #fcfcfd;
      color: #6b7280;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    tfoot td {
      position: sticky;
      bottom: 0;
      background: #f9fafb;
      z-index: 1;
    }
    .agg-select {
      font-size: 0.7rem;
      border: 1px solid m.$gray-border;
      border-radius: 3px;
    }
    .agg-val {
      font-weight: 700;
      margin-left: 0.35rem;
      color: m.$brand-dark;
    }
    .empty {
      text-align: center;
      color: #9ca3af;
      padding: 2rem;
    }
    .virt-spacer td {
      border: none;
      padding: 0;
    }
  }
  .hidden {
    display: none !important;
  }
  .multi-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-height: 140px;
    overflow-y: auto;
    @include m.subtle-scroll;
  }
  .multi-list-card {
    max-height: 220px;
    border: 1px solid m.$gray-border;
    border-radius: 0.5rem;
    padding: 0.4rem;
  }
  .multi-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    cursor: pointer;
    color: #334155;
    input {
      accent-color: m.$brand;
    }
  }
  .multi-actions {
    display: flex;
    gap: 0.35rem;
  }
</style>
