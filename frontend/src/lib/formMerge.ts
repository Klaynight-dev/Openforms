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
function weave(primary: string[], secondary: string[], include: Set<string>): string[] {
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
