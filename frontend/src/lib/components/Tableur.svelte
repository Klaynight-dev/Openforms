<script lang="ts">
  import type { FieldDefinition, MetaColumn, ResponseRow } from "../types.ts";
  import { api } from "../api/client.ts";
  import { evaluateRowFormula, evaluateAggregate } from "../formulaEngine.ts";
  import {
    IconSearch,
    IconSortAsc,
    IconSortDesc,
    IconPlus,
    IconTrash,
    IconClose,
    IconImport,
    IconDownload,
    IconExcel,
    IconFormula,
    IconCheckCircle,
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
  }

  // Colonnes = champs du formulaire + colonnes de métadonnées.
  let columns = $derived<Column[]>([
    ...fields
      .filter((f) => f.type !== "file")
      .map((f) => ({
        key: f.key,
        label: f.label,
        source: "field" as const,
        editable: canEdit && f.type !== "grid",
        numeric: f.type === "number",
      })),
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
  let columnFilters = $state<Record<string, string>>({});
  let sortKey = $state("");
  let sortDir = $state<"asc" | "desc" | null>(null);
  let editing = $state<{ rowId: string; key: string } | null>(null);
  let editValue = $state("");
  let aggregates = $state<Record<string, string>>({}); // colKey -> "SUM" | "AVG" | ...
  let busy = $state(false);
  let message = $state<string | null>(null);

  // Valeur brute d'une cellule (champ, méta ou formule calculée par ligne).
  function rawValue(row: ResponseRow, col: Column): unknown {
    if (col.source === "field") return row.values[col.key];
    if (col.kind === "formula" && col.formula) {
      return evaluateRowFormula(col.formula, { ...row.values, ...row.metadata });
    }
    return row.metadata[col.key];
  }

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === "object" ? (v as any).originalName ?? JSON.stringify(v) : v)).join(", ");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // --- Filtrage + tri (réactif) ---
  let viewRows = $derived.by(() => {
    let data = [...rows];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      data = data.filter((row) =>
        columns.some((c) => formatCell(rawValue(row, c)).toLowerCase().includes(q)),
      );
    }
    for (const [key, filter] of Object.entries(columnFilters)) {
      const f = filter.trim().toLowerCase();
      if (!f) continue;
      const col = columns.find((c) => c.key === key);
      if (!col) continue;
      data = data.filter((row) => formatCell(rawValue(row, col)).toLowerCase().includes(f));
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
          else cmp = formatCell(va).localeCompare(formatCell(vb));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return data;
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
    editValue = formatCell(rawValue(row, col));
  }

  async function commitEdit() {
    if (!editing) return;
    const col = columns.find((c) => c.key === editing!.key);
    const row = rows.find((r) => r.id === editing!.rowId);
    const target = editing;
    editing = null;
    if (!col || !row) return;

    let value: unknown = editValue;
    if (col.numeric) value = editValue === "" ? null : Number(editValue);

    // Mise à jour optimiste locale.
    if (col.source === "field") row.values[col.key] = value;
    else row.metadata[col.key] = value;
    rows = [...rows];

    try {
      await api.updateCell(target.rowId, col.source === "field" ? "field" : "meta", col.key, value);
    } catch (e) {
      message = e instanceof Error ? e.message : "Échec de la sauvegarde.";
    }
  }

  function editKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") editing = null;
  }

  // Action de focus automatique à l'apparition de l'input.
  function focus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  // --- Lignes : ajout / suppression ---
  async function addRow() {
    busy = true;
    try {
      const res = await api.addResponseRow(formId);
      rows = [res.row, ...rows];
    } catch (e) {
      message = e instanceof Error ? e.message : "Échec de l'ajout.";
    } finally {
      busy = false;
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Supprimer définitivement cette réponse ?")) return;
    try {
      await api.deleteResponse(id);
      rows = rows.filter((r) => r.id !== id);
    } catch (e) {
      message = e instanceof Error ? e.message : "Échec de la suppression.";
    }
  }

  // --- Colonnes de métadonnées : ajout / suppression ---
  function addColumn() {
    const label = prompt("Nom de la nouvelle colonne :");
    if (!label) return;
    const col: MetaColumn = { key: `meta_${Date.now().toString(36)}`, label, kind: "text" };
    metaColumns = [...metaColumns, col];
    onMetaColumnsChange?.(metaColumns);
  }

  function removeColumn(key: string) {
    if (!confirm("Retirer cette colonne de métadonnées ?")) return;
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

  // --- Export XLSX / CSV (ExcelJS, chargé à la demande) ---
  async function exportXlsx() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(formTitle.slice(0, 30));
    ws.columns = [
      { header: "Soumis le", key: "_ts", width: 20 },
      ...columns.map((c) => ({ header: c.label, key: c.key, width: 22 })),
    ];
    for (const row of viewRows) {
      const record: Record<string, unknown> = { _ts: new Date(row.submittedAt).toLocaleString() };
      for (const c of columns) record[c.key] = formatCell(rawValue(row, c));
      ws.addRow(record);
    }
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(new Blob([buf]), `${formTitle}.xlsx`);
  }

  async function exportCsv() {
    const header = ["Soumis le", ...columns.map((c) => c.label)];
    const lines = [header.map(csvCell).join(",")];
    for (const row of viewRows) {
      const cells = [new Date(row.submittedAt).toLocaleString(), ...columns.map((c) => formatCell(rawValue(row, c)))];
      lines.push(cells.map(csvCell).join(","));
    }
    downloadBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${formTitle}.csv`);
  }

  function csvCell(v: string): string {
    return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Import XLSX / CSV : met à jour les cellules par correspondance de colonnes ---
  async function importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    busy = true;
    message = null;
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
          const value = col.numeric ? Number(cellVal) : String(cellVal ?? "");
          if (col.source === "field") target.values[col.key] = value;
          else target.metadata[col.key] = value;
          await api.updateCell(target.id, col.source === "field" ? "field" : "meta", col.key, value);
          updates++;
        }
      }
      rows = [...rows];
      message = `Import terminé : ${updates} cellule(s) mise(s) à jour.`;
    } catch (err) {
      message = err instanceof Error ? err.message : "Import impossible.";
    } finally {
      busy = false;
      input.value = "";
    }
  }
</script>

<div class="tableur-container">
  <div class="toolbar">
    <div class="search-box">
      <span class="search-ico"><IconSearch size={16} /></span>
      <input type="text" placeholder="Filtrer toutes les colonnes…" bind:value={searchQuery} class="search-input" />
    </div>
    <div class="spacer"></div>
    {#if canEdit}
      <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={addRow} disabled={busy} type="button"><IconPlus size={14} weight="bold" /> Ligne</button>
      <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={addColumn} type="button"><IconPlus size={14} weight="bold" /> Colonne</button>
      <label class="btn-secondary cursor-pointer !px-3 !py-1.5 text-xs">
        <IconImport size={15} /> Importer
        <input type="file" accept=".xlsx,.csv" class="hidden" onchange={importFile} />
      </label>
    {/if}
    <button class="btn-secondary !px-3 !py-1.5 text-xs" onclick={exportCsv} type="button"><IconDownload size={15} /> CSV</button>
    <button class="btn-primary !px-3 !py-1.5 text-xs" onclick={exportXlsx} type="button"><IconExcel size={15} /> Excel</button>
  </div>

  {#if message}
    <div class="msg">
      <span class="flex items-center gap-1.5"><IconCheckCircle size={15} weight="fill" /> {message}</span>
      <button onclick={() => (message = null)} type="button" aria-label="Fermer"><IconClose size={14} /></button>
    </div>
  {/if}

  <div class="table-wrapper">
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
              <input class="col-filter" placeholder="filtrer…" bind:value={columnFilters[col.key]} />
            </th>
          {/each}
          <th class="meta-th">Soumis le</th>
          {#if canEdit}<th class="meta-th"></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each viewRows as row, i (row.id)}
          <tr>
            <td class="idx">{i + 1}</td>
            {#each columns as col (col.key)}
              <td
                class:editable={col.editable}
                ondblclick={() => startEdit(row, col)}
                title={col.editable ? "Double-cliquez pour modifier" : ""}
              >
                {#if editing?.rowId === row.id && editing?.key === col.key}
                  <input
                    class="cell-editor"
                    type={col.numeric ? "number" : "text"}
                    bind:value={editValue}
                    onblur={commitEdit}
                    onkeydown={editKeydown}
                    use:focus
                  />
                {:else}
                  <span class="cell-content">{formatCell(rawValue(row, col))}</span>
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
    .spacer {
      flex: 1;
    }
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
  .msg {
    display: flex;
    justify-content: space-between;
    background: #ecfdf5;
    color: #065f46;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    border: 1px solid #a7f3d0;
    button {
      background: none;
      border: none;
      cursor: pointer;
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
  }
  .hidden {
    display: none;
  }
</style>
