import { t, type Static } from "elysia";
import { Value } from "@sinclair/typebox/value";
import { FieldDefinitionSchema, MetaColumnSchema, type FieldDefinition, type MetaColumn } from "./formSchema.ts";

/**
 * Opérations d'édition d'un formulaire.
 *
 * L'éditeur n'envoie jamais le formulaire entier : il envoie ce qu'il a fait,
 * question par question. Le serveur applique les opérations dans l'ordre où il
 * les reçoit, si bien que deux personnes qui modifient deux questions
 * différentes ne peuvent pas s'écraser mutuellement : le dernier à enregistrer
 * n'emporte plus avec lui une copie périmée des questions de l'autre.
 *
 * Les opérations sont idempotentes : un client qui renvoie une opération dont
 * il n'a pas reçu l'accusé (coupure réseau) ne la double pas.
 */

const Key = t.String({ pattern: "^[a-zA-Z0-9_]{1,64}$" });

export const FormOpSchema = t.Union([
  /** Crée la question ou remplace son contenu. `after` place une question nouvelle
   *  (clé de la précédente, `null` = en tête) ; il est ignoré pour une question existante. */
  t.Object({ t: t.Literal("upsert"), field: t.Any(), after: t.Optional(t.Nullable(Key)) }),
  t.Object({ t: t.Literal("remove"), key: Key }),
  /** Déplace une question juste après `after` (`null` = en tête). */
  t.Object({ t: t.Literal("move"), key: Key, after: t.Nullable(Key) }),
  /** Titre, description, traductions : seules les propriétés présentes changent. */
  t.Object({
    t: t.Literal("meta"),
    title: t.Optional(t.String({ maxLength: 300 })),
    description: t.Optional(t.String({ maxLength: 2000 })),
    translations: t.Optional(t.Any()),
  }),
  /** Colonnes de métadonnées du tableur (remplacées en entier). */
  t.Object({ t: t.Literal("metaColumns"), metaColumns: t.Any() }),
]);

export type FormOp = Static<typeof FormOpSchema>;

export const MAX_FIELDS = 300;

/** Partie d'un formulaire que les opérations modifient. */
export interface FormContent {
  schema: FieldDefinition[];
  title: string;
  description: string;
  translations: unknown;
  metaColumns: MetaColumn[];
}

/**
 * Question validée, propriétés inconnues retirées (comme le fait la
 * validation d'Elysia sur l'API REST), ou `null` si elle est invalide.
 */
export function cleanField(raw: unknown): FieldDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const copy = Value.Clean(FieldDefinitionSchema, structuredClone(raw));
  return Value.Check(FieldDefinitionSchema, copy) ? (copy as FieldDefinition) : null;
}

function cleanMetaColumns(raw: unknown): MetaColumn[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const out: MetaColumn[] = [];
  for (const column of raw) {
    const copy = Value.Clean(MetaColumnSchema, structuredClone(column));
    if (!Value.Check(MetaColumnSchema, copy)) return null;
    out.push(copy as MetaColumn);
  }
  return out;
}

function insertAfter(schema: FieldDefinition[], field: FieldDefinition, after: string | null | undefined) {
  if (after === null) {
    schema.unshift(field);
    return;
  }
  const index = after === undefined ? -1 : schema.findIndex((f) => f.key === after);
  // Voisine inconnue (supprimée entre-temps par quelqu'un d'autre) : en fin de liste.
  if (index < 0) schema.push(field);
  else schema.splice(index + 1, 0, field);
}

/**
 * Applique une opération. Renvoie l'opération telle qu'appliquée (question
 * nettoyée), ou `null` si elle est refusée ; `content` n'est alors pas modifié.
 */
export function applyOp(content: FormContent, op: FormOp): FormOp | null {
  switch (op.t) {
    case "upsert": {
      const field = cleanField(op.field);
      if (!field) return null;
      const index = content.schema.findIndex((f) => f.key === field.key);
      if (index >= 0) {
        content.schema[index] = field;
      } else {
        if (content.schema.length >= MAX_FIELDS) return null;
        insertAfter(content.schema, field, op.after);
      }
      return { ...op, field };
    }
    case "remove": {
      content.schema = content.schema.filter((f) => f.key !== op.key);
      return op;
    }
    case "move": {
      const index = content.schema.findIndex((f) => f.key === op.key);
      if (index < 0 || op.after === op.key) return op;
      if (op.after !== null && !content.schema.some((f) => f.key === op.after)) return op;
      const [field] = content.schema.splice(index, 1);
      insertAfter(content.schema, field!, op.after);
      return op;
    }
    case "meta": {
      if (op.title !== undefined) content.title = op.title;
      if (op.description !== undefined) content.description = op.description;
      if (op.translations !== undefined) content.translations = op.translations;
      return op;
    }
    case "metaColumns": {
      const metaColumns = cleanMetaColumns(op.metaColumns);
      if (!metaColumns) return null;
      content.metaColumns = metaColumns;
      return { ...op, metaColumns };
    }
  }
}
