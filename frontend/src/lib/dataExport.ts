/**
 * Export tabulaire des données (Excel, CSV, JSON).
 *
 * Un seul chemin de code partagé par le tableur et la page Statistiques, pour
 * que les trois formats restent cohérents entre eux : mêmes colonnes, mêmes
 * valeurs, et le même bloc de contexte (titre, légende, filtres actifs, date)
 * que celui incrusté dans les exports d'images. Sans ce contexte, un tableau
 * filtré se lit ensuite comme un total, ce qui est la première source d'erreur
 * d'interprétation.
 *
 * ExcelJS n'est chargé qu'au moment d'un export XLSX : la bibliothèque est
 * lourde et n'a rien à faire dans le bundle initial.
 */

export type DataFormat = "xlsx" | "csv" | "json";

export interface ExportColumn {
  key: string;
  label: string;
  /** `number` produit une cellule numérique en XLSX et une valeur nue en JSON. */
  kind?: "text" | "number" | "date";
}

export interface ExportMetaEntry {
  label: string;
  value: string;
}

export interface DataExportOptions {
  /** Sans extension : elle est ajoutée selon le format. */
  filename: string;
  columns: ExportColumn[];
  /** Lignes indexées par `column.key`. */
  rows: Record<string, unknown>[];
  format: DataFormat;
  sheetName?: string;
  /** Contexte de l'export : titre, légende, filtres, nombre de réponses… */
  meta?: ExportMetaEntry[];
  /**
   * Inclure le contexte dans le fichier. En XLSX il occupe un onglet dédié, en
   * JSON une clé `contexte`, en CSV des lignes préfixées `#` — désactivé par
   * défaut pour le CSV, que la plupart des tableurs lisent sans en-tête libre.
   */
  includeMeta?: boolean;
}

const EXTENSIONS: Record<DataFormat, string> = { xlsx: "xlsx", csv: "csv", json: "json" };

export const FORMAT_LABELS: Record<DataFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  json: "JSON (.json)",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Cellule CSV : guillemets doublés, et échappement du `=` en tête (injection de formule). */
function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // Un tableur interprète une cellule commençant par = + - @ comme une formule.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(options: DataExportOptions): Blob {
  const lines: string[] = [];
  if (options.includeMeta && options.meta?.length) {
    for (const entry of options.meta) {
      lines.push(`# ${entry.label}: ${entry.value.replace(/\r?\n/g, " ")}`);
    }
    lines.push("");
  }
  lines.push(options.columns.map((c) => csvCell(c.label)).join(","));
  for (const row of options.rows) {
    lines.push(options.columns.map((c) => csvCell(row[c.key])).join(","));
  }
  // BOM UTF-8 : sans lui, Excel sous Windows casse les accents.
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

function toJson(options: DataExportOptions): Blob {
  const payload: Record<string, unknown> = {
    exporteLe: new Date().toISOString(),
    colonnes: options.columns.map((c) => ({ cle: c.key, libelle: c.label, type: c.kind ?? "text" })),
    nombreDeLignes: options.rows.length,
    lignes: options.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of options.columns) {
        const value = row[col.key];
        out[col.key] =
          col.kind === "number" && value !== "" && value != null && !isNaN(Number(value))
            ? Number(value)
            : (value ?? null);
      }
      return out;
    }),
  };
  if (options.includeMeta !== false && options.meta?.length) {
    payload.contexte = Object.fromEntries(options.meta.map((m) => [m.label, m.value]));
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
}

async function toXlsx(options: DataExportOptions): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(options.sheetName ?? "Données");
  sheet.columns = options.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.min(46, Math.max(12, c.label.length + 4)),
  }));

  for (const row of options.rows) {
    const record: Record<string, unknown> = {};
    for (const col of options.columns) {
      const value = row[col.key];
      record[col.key] =
        col.kind === "number" && value !== "" && value != null && !isNaN(Number(value))
          ? Number(value)
          : value;
    }
    sheet.addRow(record);
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF673AB7" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  // En-tête figé + filtres : le réflexe attendu de quiconque ouvre le fichier.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (options.columns.length > 0 && options.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: options.columns.length },
    };
  }

  if (options.includeMeta !== false && options.meta?.length) {
    const contextSheet = workbook.addWorksheet("Contexte");
    contextSheet.columns = [
      { header: "Information", key: "label", width: 26 },
      { header: "Valeur", key: "value", width: 80 },
    ];
    const contextHeader = contextSheet.getRow(1);
    contextHeader.font = { bold: true };
    for (const entry of options.meta) {
      const row = contextSheet.addRow({ label: entry.label, value: entry.value });
      row.getCell("value").alignment = { wrapText: true, vertical: "top" };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Produit et télécharge le fichier. Lève si la génération échoue. */
export async function exportData(options: DataExportOptions): Promise<void> {
  const blob =
    options.format === "xlsx"
      ? await toXlsx(options)
      : options.format === "csv"
        ? toCsv(options)
        : toJson(options);
  downloadBlob(blob, `${sanitizeFilename(options.filename)}.${EXTENSIONS[options.format]}`);
}

/** Nettoie un titre de formulaire pour en faire un nom de fichier sûr. */
export function sanitizeFilename(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return clean || "export";
}
