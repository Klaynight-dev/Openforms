import type { FieldType, FieldDefinition } from "./types.ts";

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  icon: string;
  hasOptions: boolean;
  hasGrid: boolean;
  isFile: boolean;
}

export const FIELD_TYPE_META: FieldTypeMeta[] = [
  { type: "section", label: "Section / Page suivante", icon: "S", hasOptions: false, hasGrid: false, isFile: false },
  { type: "short_text", label: "Texte court", icon: "T", hasOptions: false, hasGrid: false, isFile: false },
  { type: "paragraph", label: "Paragraphe", icon: "P", hasOptions: false, hasGrid: false, isFile: false },
  { type: "email", label: "Email", icon: "@", hasOptions: false, hasGrid: false, isFile: false },
  { type: "number", label: "Nombre", icon: "#", hasOptions: false, hasGrid: false, isFile: false },
  { type: "radio", label: "Choix unique", icon: "o", hasOptions: true, hasGrid: false, isFile: false },
  { type: "checkbox", label: "Choix multiple", icon: "x", hasOptions: true, hasGrid: false, isFile: false },
  { type: "select", label: "Liste déroulante", icon: "v", hasOptions: true, hasGrid: false, isFile: false },
  { type: "date", label: "Date", icon: "d", hasOptions: false, hasGrid: false, isFile: false },
  { type: "datetime", label: "Date & heure", icon: "dt", hasOptions: false, hasGrid: false, isFile: false },
  { type: "file", label: "Fichier", icon: "f", hasOptions: false, hasGrid: false, isFile: true },
  { type: "grid", label: "Grille (choix unique)", icon: "g", hasOptions: false, hasGrid: true, isFile: false },
  { type: "linear_scale", label: "Échelle linéaire", icon: "~", hasOptions: false, hasGrid: false, isFile: false },
  { type: "checkbox_grid", label: "Grille (choix multiple)", icon: "cg", hasOptions: false, hasGrid: true, isFile: false },
];

export function metaFor(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META.find((m) => m.type === type) ?? FIELD_TYPE_META[0];
}

let counter = 0;
export function newField(type: FieldType): FieldDefinition {
  counter += 1;
  const base: FieldDefinition = {
    key: `champ_${Date.now().toString(36)}_${counter}`,
    type,
    label: metaFor(type).label,
    required: false,
  };
  if (metaFor(type).hasOptions) {
    base.options = [
      { value: "opt1", label: "Option 1" },
      { value: "opt2", label: "Option 2" },
    ];
  }
  if (type === "grid" || type === "checkbox_grid") {
    base.grid = { rows: ["Ligne 1", "Ligne 2"], columns: ["Colonne A", "Colonne B"] };
  }
  if (type === "linear_scale") {
    base.scale = { min: 1, max: 5, minLabel: "", maxLabel: "" };
  }
  if (type === "short_text" || type === "paragraph" || type === "number" || type === "email") {
    base.validation = {};
  }
  return base;
}
