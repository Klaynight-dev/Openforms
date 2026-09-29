/**
 * Opérations d'édition d'un formulaire, côté éditeur.
 *
 * L'éditeur n'envoie jamais le formulaire entier : il compare ce qu'il affiche
 * à ce que le serveur a (ou aura, une fois ses envois appliqués) et envoie
 * l'écart sous forme d'opérations, question par question. Le serveur les
 * applique dans l'ordre d'arrivée et les rediffuse aux autres éditeurs, qui
 * les appliquent à leur tour. Voir backend/src/lib/formOps.ts, dont les règles
 * d'application sont reprises ici à l'identique.
 */
import type { FieldDefinition, MetaColumn } from "./types.ts";

export type FormOp =
  | { t: "upsert"; field: FieldDefinition; after?: string | null }
  | { t: "remove"; key: string }
  | { t: "move"; key: string; after: string | null }
  | { t: "meta"; title?: string; description?: string; translations?: unknown }
  | { t: "metaColumns"; metaColumns: MetaColumn[] };

/** Réglages de l'éditeur transmis par opérations. */
export const META_KEYS = ["title", "description", "translations"] as const;
export type MetaKey = (typeof META_KEYS)[number];

export interface EditorContent {
  fields: FieldDefinition[];
  settings: Record<string, unknown>;
}

/** Sérialisation à clés triées : l'ordre d'insertion des propriétés ne compte pas. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Copie détachée (JSON) : aucune référence partagée avec l'état de l'éditeur. */
export function detach<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function insertAfter<T extends { key: string }>(list: T[], item: T, after: string | null | undefined) {
  if (after === null) {
    list.unshift(item);
    return;
  }
  const index = after === undefined ? -1 : list.findIndex((f) => f.key === after);
  if (index < 0) list.push(item);
  else list.splice(index + 1, 0, item);
}

/**
 * Opérations qui mènent de `shared` à `local`. Appliquées à `shared` dans
 * l'ordre, elles redonnent exactement `local` (questions et réglages).
 */
export function diffToOps(shared: EditorContent, local: EditorContent): FormOp[] {
  const ops: FormOp[] = [];

  const meta: Partial<Record<MetaKey, unknown>> = {};
  for (const key of META_KEYS) {
    if (!sameValue(shared.settings[key], local.settings[key])) meta[key] = local.settings[key];
  }
  if (Object.keys(meta).length > 0) ops.push({ t: "meta", ...meta } as FormOp);

  const sharedByKey = new Map(shared.fields.map((f) => [f.key, f]));
  const localKeys = new Set(local.fields.map((f) => f.key));
  for (const field of shared.fields) {
    if (!localKeys.has(field.key)) ops.push({ t: "remove", key: field.key });
  }

  // Ordre simulé côté serveur, mis à jour au fil des opérations émises.
  const order = shared.fields.map((f) => f.key).filter((key) => localKeys.has(key));
  const place = (key: string, after: string | null) => {
    order.splice(after === null ? 0 : order.indexOf(after) + 1, 0, key);
  };

  local.fields.forEach((field, index) => {
    const after = index === 0 ? null : local.fields[index - 1].key;
    const at = order.indexOf(field.key);
    if (at < 0) {
      ops.push({ t: "upsert", field, after });
      place(field.key, after);
      return;
    }
    if (!sameValue(field, sharedByKey.get(field.key))) ops.push({ t: "upsert", field });
    const currentAfter = at === 0 ? null : order[at - 1];
    if (currentAfter !== after) {
      ops.push({ t: "move", key: field.key, after });
      order.splice(at, 1);
      place(field.key, after);
    }
  });

  return ops;
}

/**
 * Applique des opérations à une liste de questions. `replace` décide du sort
 * d'une question existante : mise à jour sur place (éditeur affiché : la
 * carte, le focus et la saisie en cours sont préservés) ou copie.
 */
export function applyOpsToFields<F extends { key: string }>(
  fields: F[],
  ops: FormOp[],
  replace: (current: F, incoming: F) => F,
): F[] {
  let list = [...fields];
  for (const op of ops) {
    if (op.t === "upsert") {
      const incoming = op.field as unknown as F;
      const index = list.findIndex((f) => f.key === incoming.key);
      if (index >= 0) list[index] = replace(list[index], incoming);
      else insertAfter(list, detach(incoming), op.after);
    } else if (op.t === "remove") {
      list = list.filter((f) => f.key !== op.key);
    } else if (op.t === "move") {
      const index = list.findIndex((f) => f.key === op.key);
      if (index < 0 || op.after === op.key) continue;
      if (op.after !== null && !list.some((f) => f.key === op.after)) continue;
      const [moved] = list.splice(index, 1);
      insertAfter(list, moved, op.after);
    }
  }
  return list;
}

/** Applique les réglages portés par des opérations `meta`. */
export function applyMeta(settings: Record<string, unknown>, ops: FormOp[]): void {
  for (const op of ops) {
    if (op.t !== "meta") continue;
    for (const key of META_KEYS) {
      if (op[key] !== undefined) settings[key] = detach(op[key]);
    }
  }
}

/** Contenu après application des opérations (copie, `content` intact). */
export function applyOpsToContent(content: EditorContent, ops: FormOp[]): EditorContent {
  const settings = detach(content.settings);
  applyMeta(settings, ops);
  return { fields: applyOpsToFields(detach(content.fields), ops, (_current, incoming) => detach(incoming)), settings };
}

/**
 * Remplace le contenu d'un objet par celui d'un autre sans changer son
 * identité. Seules les propriétés qui diffèrent sont écrites.
 */
export function patchInPlace(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (!sameValue(target[key], value)) target[key] = detach(value);
  }
}

/** Ce que touchent des opérations : clés de questions et `meta:<réglage>`. */
export function touchedKeys(ops: FormOp[]): Set<string> {
  const keys = new Set<string>();
  for (const op of ops) {
    if (op.t === "upsert") keys.add(op.field.key);
    else if (op.t === "remove" || op.t === "move") keys.add(op.key);
    else if (op.t === "meta") {
      for (const key of META_KEYS) if (op[key] !== undefined) keys.add(`meta:${key}`);
    } else if (op.t === "metaColumns") keys.add("metaColumns");
  }
  return keys;
}

/**
 * Retire des opérations reçues ce qui porte sur des éléments que l'on a
 * soi-même modifiés sans en avoir encore l'accusé : le serveur appliquera
 * nos opérations après celles-ci, c'est donc notre version qui restera.
 */
export function withoutKeys(ops: FormOp[], keys: Set<string>): FormOp[] {
  if (keys.size === 0) return ops;
  const out: FormOp[] = [];
  for (const op of ops) {
    if (op.t === "upsert") {
      if (!keys.has(op.field.key)) out.push(op);
    } else if (op.t === "remove" || op.t === "move") {
      if (!keys.has(op.key)) out.push(op);
    } else if (op.t === "meta") {
      const kept: FormOp = { t: "meta" };
      let any = false;
      for (const key of META_KEYS) {
        if (op[key] !== undefined && !keys.has(`meta:${key}`)) {
          (kept as Record<string, unknown>)[key] = op[key];
          any = true;
        }
      }
      if (any) out.push(kept);
    } else if (!keys.has("metaColumns")) {
      out.push(op);
    }
  }
  return out;
}

/**
 * Reporte des opérations reçues dans un état passé de l'historique
 * d'annulation, pour que Ctrl+Z ne défasse que ses propres modifications.
 * Seul le contenu est reporté (questions présentes dans cet état, réglages) :
 * les ajouts, suppressions et déplacements ne le sont pas.
 */
export function rebaseContent(content: EditorContent, ops: FormOp[]): EditorContent {
  const incoming = new Map<string, FieldDefinition>();
  for (const op of ops) if (op.t === "upsert") incoming.set(op.field.key, op.field);
  const settings = { ...content.settings };
  applyMeta(settings, ops);
  return {
    fields: content.fields.map((f) => (incoming.has(f.key) ? detach(incoming.get(f.key)!) : f)),
    settings,
  };
}
