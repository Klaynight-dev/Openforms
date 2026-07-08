import { t, type Static } from "elysia";

/**
 * Types de champs supportés par le builder. Sert de source de vérité partagée
 * entre la validation côté API et le rendu côté frontend.
 */
export const FIELD_TYPES = [
  "short_text",
  "paragraph",
  "email",
  "number",
  "radio",
  "checkbox",
  "select",
  "date",
  "datetime",
  "file",
  "grid",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const OptionSchema = t.Object({
  value: t.String({ minLength: 1, maxLength: 200 }),
  label: t.String({ minLength: 1, maxLength: 200 }),
});

const ValidationSchema = t.Optional(
  t.Object({
    minLength: t.Optional(t.Integer({ minimum: 0 })),
    maxLength: t.Optional(t.Integer({ minimum: 1 })),
    /** Expression régulière personnalisée (validée avant compilation). */
    pattern: t.Optional(t.String({ maxLength: 500 })),
    min: t.Optional(t.Number()),
    max: t.Optional(t.Number()),
  }),
);

const ConditionSchema = t.Optional(
  t.Object({
    fieldKey: t.String({ pattern: "^[a-zA-Z0-9_]{1,64}$" }),
    value: t.String({ maxLength: 200 }),
  })
);

/** Définition d'un champ de formulaire. */
export const FieldDefinitionSchema = t.Object({
  key: t.String({ pattern: "^[a-zA-Z0-9_]{1,64}$" }),
  type: t.Union(FIELD_TYPES.map((v) => t.Literal(v))),
  label: t.String({ minLength: 1, maxLength: 300 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  placeholder: t.Optional(t.String({ maxLength: 300 })),
  required: t.Boolean({ default: false }),
  options: t.Optional(t.Array(OptionSchema, { maxItems: 200 })),
  allowOther: t.Optional(t.Boolean()),
  condition: ConditionSchema,
  validation: ValidationSchema,
  /** Champ "file" : types MIME acceptés + taille max en octets. */
  accept: t.Optional(t.Array(t.String({ maxLength: 100 }), { maxItems: 50 })),
  maxSizeBytes: t.Optional(t.Integer({ minimum: 1 })),
  /** Champ "grid" : lignes et colonnes de la grille d'évaluation. */
  grid: t.Optional(
    t.Object({
      rows: t.Array(t.String({ maxLength: 200 }), { maxItems: 100 }),
      columns: t.Array(t.String({ maxLength: 200 }), { maxItems: 100 }),
    }),
  ),
});

export type FieldDefinition = Static<typeof FieldDefinitionSchema>;

/** Le schéma complet d'un formulaire est une liste ordonnée de champs. */
export const FormSchemaArray = t.Array(FieldDefinitionSchema, { maxItems: 300 });

/** Colonne de métadonnées du tableur admin. */
export const MetaColumnSchema = t.Object({
  key: t.String({ pattern: "^[a-zA-Z0-9_]{1,64}$" }),
  label: t.String({ minLength: 1, maxLength: 200 }),
  kind: t.Union([t.Literal("text"), t.Literal("number"), t.Literal("formula")]),
  formula: t.Optional(t.String({ maxLength: 500 })),
});
export type MetaColumn = Static<typeof MetaColumnSchema>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationError {
  key: string;
  message: string;
}

function isConditionMet(
  condition: { fieldKey: string; value: string } | undefined,
  cleanValues: Record<string, any>,
): boolean {
  if (!condition) return true;
  const val = cleanValues[condition.fieldKey];
  if (val == null) return false;
  if (Array.isArray(val)) {
    return val.map(String).includes(condition.value);
  }
  return String(val) === condition.value;
}

/**
 * Valide les réponses soumises (`data`) contre la définition d'un formulaire.
 * Applique : requis, longueurs, regex, bornes numériques, appartenance aux options.
 * Renvoie la liste des erreurs (vide si tout est valide) et les valeurs normalisées.
 */
export function validateSubmission(
  fields: FieldDefinition[],
  data: Record<string, unknown>,
): { errors: ValidationError[]; clean: Record<string, unknown> } {
  const errors: ValidationError[] = [];
  const clean: Record<string, unknown> = {};

  let currentSectionKey: string | null = null;
  const visibleFields = new Set<string>();

  for (const field of fields) {
    let parentSectionVisible = true;
    if (field.type !== "section" && currentSectionKey !== null) {
      parentSectionVisible = visibleFields.has(currentSectionKey);
    }
    const fieldVisible = parentSectionVisible && isConditionMet(field.condition, clean);

    if (field.type === "section") {
      currentSectionKey = field.key;
      if (fieldVisible) {
        visibleFields.add(field.key);
      }
      continue;
    }

    if (!fieldVisible) {
      continue;
    }

    visibleFields.add(field.key);

    const raw = data[field.key];
    const isEmpty =
      raw === undefined ||
      raw === null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);

    if (isEmpty) {
      if (field.required) errors.push({ key: field.key, message: `« ${field.label} » est requis.` });
      continue;
    }

    const v = field.validation;
    switch (field.type) {
      case "short_text":
      case "paragraph": {
        const s = String(raw);
        if (v?.minLength != null && s.length < v.minLength)
          errors.push({ key: field.key, message: `« ${field.label} » : minimum ${v.minLength} caractères.` });
        if (v?.maxLength != null && s.length > v.maxLength)
          errors.push({ key: field.key, message: `« ${field.label} » : maximum ${v.maxLength} caractères.` });
        if (v?.pattern && !safeRegexTest(v.pattern, s))
          errors.push({ key: field.key, message: `« ${field.label} » : format invalide.` });
        clean[field.key] = s;
        break;
      }
      case "email": {
        const s = String(raw).trim();
        if (!EMAIL_RE.test(s))
          errors.push({ key: field.key, message: `« ${field.label} » : email invalide.` });
        clean[field.key] = s;
        break;
      }
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          errors.push({ key: field.key, message: `« ${field.label} » : nombre invalide.` });
          break;
        }
        if (v?.min != null && n < v.min)
          errors.push({ key: field.key, message: `« ${field.label} » : doit être ≥ ${v.min}.` });
        if (v?.max != null && n > v.max)
          errors.push({ key: field.key, message: `« ${field.label} » : doit être ≤ ${v.max}.` });
        clean[field.key] = n;
        break;
      }
      case "radio":
      case "select": {
        const s = String(raw);
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        const isOther = field.allowOther && (s === "__other__" || s.startsWith("__other__:"));
        if (!allowed.has(s) && !isOther)
          errors.push({ key: field.key, message: `« ${field.label} » : choix non autorisé.` });
        clean[field.key] = s;
        break;
      }
      case "checkbox": {
        const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        if (!arr.every((x) => allowed.has(x)))
          errors.push({ key: field.key, message: `« ${field.label} » : choix non autorisé.` });
        clean[field.key] = arr;
        break;
      }
      case "date":
      case "datetime": {
        const s = String(raw);
        if (Number.isNaN(Date.parse(s)))
          errors.push({ key: field.key, message: `« ${field.label} » : date invalide.` });
        clean[field.key] = s;
        break;
      }
      case "grid": {
        // Objet { ligne: valeurColonne }.
        if (typeof raw !== "object" || Array.isArray(raw)) {
          errors.push({ key: field.key, message: `« ${field.label} » : réponse de grille invalide.` });
          break;
        }
        clean[field.key] = raw;
        break;
      }
      case "file": {
        // La valeur est une référence d'upload résolue en amont ; on la conserve.
        clean[field.key] = raw;
        break;
      }
    }
  }

  return { errors, clean };
}

/** Teste une regex utilisateur sans laisser une expression malformée planter le serveur. */
export function safeRegexTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    // Une regex invalide dans la définition ne doit pas rejeter la saisie.
    return true;
  }
}
