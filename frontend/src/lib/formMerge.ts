/**
 * Fusion à trois voies de l'éditeur de formulaire.
 *
 * Quand un collaborateur enregistre, chaque éditeur ouvert reçoit le nouvel
 * état du serveur (`remote`). Il le confronte à ce qu'il savait du serveur
 * avant (`base`) et à ce qu'il affiche (`local`) : ce que la personne n'a pas
 * touché prend la version distante, ce qu'elle est en train de modifier reste
 * le sien. La fusion se fait question par question, si bien que deux
 * personnes travaillant sur deux questions différentes ne se gênent pas.
 */

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

/** Valeur fusionnée : la distante, sauf si la personne a modifié la sienne. */
export function mergeValue<T>(base: T, local: T, remote: T): T {
  return sameValue(local, base) ? remote : local;
}

export interface FieldMergePlan {
  /** Clés des questions, dans l'ordre fusionné. */
  order: string[];
  /** Questions dont la version distante l'emporte (les autres restent locales). */
  takeRemote: Set<string>;
}

/**
 * Plan de fusion d'une liste de questions identifiées par leur clé.
 *
 * - question modifiée localement : la version locale reste, même si elle a
 *   été supprimée ou modifiée à distance ;
 * - question intacte localement : elle suit le serveur (modification,
 *   suppression) ;
 * - question ajoutée d'un côté : elle est conservée, à côté de sa voisine ;
 * - ordre : celui du serveur, sauf si la personne a elle-même ajouté,
 *   supprimé ou déplacé des questions.
 */
export function planFieldMerge<F extends { key: string }>(
  base: F[],
  local: F[],
  remote: F[],
): FieldMergePlan {
  const baseByKey = new Map(base.map((f) => [f.key, f]));
  const localByKey = new Map(local.map((f) => [f.key, f]));
  const remoteByKey = new Map(remote.map((f) => [f.key, f]));

  const include = new Set<string>();
  const takeRemote = new Set<string>();

  for (const key of new Set([...localByKey.keys(), ...remoteByKey.keys()])) {
    const inBase = baseByKey.has(key);
    const localField = localByKey.get(key);
    const remoteField = remoteByKey.get(key);

    if (!inBase) {
      // Ajoutée d'un côté (ou des deux, sous la même clé : la locale l'emporte).
      include.add(key);
      if (!localField) takeRemote.add(key);
      continue;
    }

    // Supprimée localement : la suppression est l'intention de la personne.
    if (!localField) continue;

    const changedLocally = !sameValue(localField, baseByKey.get(key));
    if (!remoteField) {
      // Supprimée à distance : on ne la garde que si on était en train de la modifier.
      if (changedLocally) include.add(key);
      continue;
    }

    include.add(key);
    if (!changedLocally) takeRemote.add(key);
  }

  const baseOrder = base.map((f) => f.key);
  const localOrder = local.map((f) => f.key);
  const remoteOrder = remote.map((f) => f.key);
  const localReordered = !sameValue(localOrder, baseOrder);

  const order = localReordered
    ? weave(localOrder, remoteOrder, include)
    : weave(remoteOrder, localOrder, include);

  return { order, takeRemote };
}

/**
 * Ordre `primary`, complété des clés retenues qui n'y figurent pas : chacune
 * est placée juste après sa voisine précédente dans `secondary`.
 */
export function weave(primary: string[], secondary: string[], include: Set<string>): string[] {
  const out = primary.filter((key) => include.has(key));
  secondary.forEach((key, index) => {
    if (!include.has(key) || out.includes(key)) return;
    let position = 0;
    for (let j = index - 1; j >= 0; j--) {
      const found = out.indexOf(secondary[j]);
      if (found >= 0) {
        position = found + 1;
        break;
      }
    }
    out.splice(position, 0, key);
  });
  return out;
}

/**
 * Remplace le contenu d'un objet par celui d'un autre, sans changer son
 * identité : la carte de la question reste montée, le focus et la saisie en
 * cours ne sont pas perdus. Seules les propriétés qui diffèrent sont écrites.
 */
export function patchInPlace(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (!sameValue(target[key], value)) target[key] = structuredClone(value);
  }
}

// ---------------------------------------------------------------------------
//  Modifications en direct
// ---------------------------------------------------------------------------
//  Chaque frappe part aux collaborateurs sans attendre l'enregistrement, comme
//  dans Canva. Seul ce qui a changé voyage : les questions modifiées en entier,
//  l'ordre des clés quand la structure bouge, les réglages touchés. Celui qui
//  reçoit applique sans renvoyer ni enregistrer : l'auteur enregistre seul.

export interface EditorContent<F extends { key: string } = { key: string }> {
  fields: F[];
  metaColumns: unknown[];
  settings: Record<string, unknown>;
}

export interface LiveEdit<F extends { key: string } = { key: string }> {
  /** Ordre complet des clés, présent seulement si des questions ont été ajoutées, retirées ou déplacées. */
  order?: string[];
  /** Questions nouvelles ou modifiées, en entier. */
  fields?: F[];
  metaColumns?: unknown[];
  /** Réglages modifiés (titre, description, traductions…). */
  settings?: Record<string, unknown>;
}

/** Ce qui sépare deux états de l'éditeur, ou `null` s'ils sont identiques. */
export function diffEditorContent<F extends { key: string }>(
  previous: EditorContent<F>,
  next: EditorContent<F>,
): LiveEdit<F> | null {
  const edit: LiveEdit<F> = {};

  const previousByKey = new Map(previous.fields.map((f) => [f.key, f]));
  const changed = next.fields.filter((f) => !sameValue(f, previousByKey.get(f.key)));
  if (changed.length > 0) edit.fields = changed;

  const order = next.fields.map((f) => f.key);
  if (!sameValue(order, previous.fields.map((f) => f.key))) edit.order = order;

  if (!sameValue(previous.metaColumns, next.metaColumns)) edit.metaColumns = next.metaColumns;

  const settings: Record<string, unknown> = {};
  for (const key of Object.keys(next.settings)) {
    if (!sameValue(previous.settings[key], next.settings[key])) settings[key] = next.settings[key];
  }
  if (Object.keys(settings).length > 0) edit.settings = settings;

  return Object.keys(edit).length > 0 ? edit : null;
}

/**
 * Applique une modification reçue à une liste de questions. Les questions
 * existantes sont mises à jour sur place (voir `patchInPlace`) ; la liste
 * renvoyée est nouvelle si l'ordre a changé, sinon c'est la même.
 *
 * `keepLocal` désigne les questions à garder même si l'ordre reçu ne les
 * contient pas : celles que l'on vient d'ajouter et que l'autre ne connaît
 * pas encore.
 */
export function applyLiveFields<F extends { key: string }>(
  fields: F[],
  edit: LiveEdit<F>,
  keepLocal: (key: string) => boolean = () => false,
): F[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const incoming of edit.fields ?? []) {
    const current = byKey.get(incoming.key);
    if (current) patchInPlace(current as Record<string, unknown>, incoming as Record<string, unknown>);
    else byKey.set(incoming.key, structuredClone(incoming));
  }
  if (!edit.order) return fields;

  const include = new Set([...edit.order, ...fields.map((f) => f.key).filter(keepLocal)]);
  return weave(edit.order, fields.map((f) => f.key), include)
    .map((key) => byKey.get(key))
    .filter((f): f is F => f !== undefined);
}

/** Applique une modification reçue à un état détaché (copie renvoyée). */
export function applyLiveEdit<F extends { key: string }>(
  content: EditorContent<F>,
  edit: LiveEdit<F>,
): EditorContent<F> {
  const copy = structuredClone(content);
  return {
    fields: applyLiveFields(copy.fields, edit),
    metaColumns: edit.metaColumns ? structuredClone(edit.metaColumns) : copy.metaColumns,
    settings: edit.settings ? { ...copy.settings, ...structuredClone(edit.settings) } : copy.settings,
  };
}

/**
 * Reporte une modification reçue dans un état passé de l'historique
 * d'annulation : Ctrl+Z défait ses propres modifications, pas celles des
 * autres. Seul le contenu est reporté (questions présentes dans cet état,
 * réglages) ; les ajouts et suppressions de questions ne le sont pas.
 */
export function rebaseEditorContent<F extends { key: string }>(
  content: EditorContent<F>,
  edit: LiveEdit<F>,
): EditorContent<F> {
  const incoming = new Map((edit.fields ?? []).map((f) => [f.key, f]));
  return {
    fields: content.fields.map((f) => (incoming.has(f.key) ? structuredClone(incoming.get(f.key)!) : f)),
    metaColumns: edit.metaColumns ? structuredClone(edit.metaColumns) : content.metaColumns,
    settings: edit.settings ? { ...content.settings, ...structuredClone(edit.settings) } : content.settings,
  };
}
