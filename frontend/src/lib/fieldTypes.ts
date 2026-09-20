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
  { type: "text_block", label: "Bloc de texte", icon: "¶", hasOptions: false, hasGrid: false, isFile: false },
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
  { type: "signature", label: "Signature numérique", icon: "✍️", hasOptions: false, hasGrid: false, isFile: false },
  { type: "address", label: "Adresse géographique", icon: "📍", hasOptions: false, hasGrid: false, isFile: false },
  { type: "stripe_payment", label: "Paiement Stripe", icon: "💳", hasOptions: false, hasGrid: false, isFile: false },
];

export function metaFor(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META.find((m) => m.type === type) ?? FIELD_TYPE_META[0];
}

/** Longueur maximale d'une clé, imposée par `FieldDefinitionSchema` côté API. */
const KEY_MAX_LENGTH = 64;

/**
 * Clé dérivée d'un libellé : « Quelle est votre priorité ? » donne
 * `quelle_est_votre_priorite`.
 *
 * La clé nomme la colonne dans les exports, dans les formules du tableur et
 * dans toute intégration qui relit les réponses. Engendrée
 * (`champ_m3x9z1_4`), elle n'apprend rien à personne : un site qui synchronise
 * ce formulaire ne peut rapprocher aucun champ de sa question, et doit tout
 * apparier à la main.
 */
export function toFieldKey(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KEY_MAX_LENGTH)
    .replace(/_+$/, "");

  return key === "" ? "champ" : key;
}

/** La même clé, rendue unique dans le formulaire par un suffixe numérique. */
export function uniqueFieldKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const room = KEY_MAX_LENGTH - String(suffix).length - 1;
    const candidate = `${base.slice(0, room)}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  // Mille champs portant le même libellé relève de la saisie, mais une clé en
  // double casserait le formulaire : on retombe sur l'horodatage.
  return `${base.slice(0, 50)}_${Date.now().toString(36)}`;
}

export function newField(type: FieldType, taken: Iterable<string> = []): FieldDefinition {
  const label = metaFor(type).label;
  const base: FieldDefinition = {
    key: uniqueFieldKey(toFieldKey(label), taken),
    type,
    label,
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
