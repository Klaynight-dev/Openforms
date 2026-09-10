/**
 * Traduction d'une réponse de formulaire en charge utile Dolibarr.
 *
 * Tout ce fichier est pur (aucun accès réseau ni base) : c'est la partie du
 * connecteur qu'on peut tester sans instance Dolibarr sous la main.
 */

/** Origine d'une propriété Dolibarr : un champ du formulaire, ou une constante. */
export type MappingSource =
  | { source: "field"; key: string }
  | { source: "const"; value: string | number | boolean };

/**
 * Correspondance « propriété Dolibarr -> origine ».
 *
 * La clé accepte la notation pointée, ce qui permet d'alimenter les extrafields
 * sans code spécifique :
 *
 *   {
 *     "lastname":  { source: "field", key: "nom" },
 *     "firstname": { source: "field", key: "prenom" },
 *     "email":     { source: "field", key: "email" },
 *     "array_options.options_licence": { source: "field", key: "num_licence" },
 *     "note_public": { source: "const", value: "Inscription en ligne" }
 *   }
 */
export type FieldMap = Record<string, MappingSource>;

export type DolibarrTarget = "MEMBER" | "MEMBER_WITH_SUBSCRIPTION" | "THIRDPARTY_CONTACT";

export interface MappingConfig {
  target: DolibarrTarget;
  fieldMap: FieldMap;
  memberTypeId?: number | null;
  subscriptionAmount?: number | null;
  subscriptionAmountKey?: string | null;
  subscriptionMonths?: number;
  /// Renseigné par le contrôleur quand la déduplication se fait par email.
  dedupeRequiresEmail?: boolean;
}

/** Valeurs d'une réponse, indexées par la `key` du champ de formulaire. */
export type ResponseValues = Record<string, unknown>;

// ---------------------------------------------------------------------------
//  Normalisation des valeurs
// ---------------------------------------------------------------------------

/**
 * Dolibarr est alimenté par une API PHP adossée à SQL : il n'accepte ni objet
 * ni tableau sur ses propriétés scalaires. On aplatit donc vers des types
 * simples, en préservant l'information autant que possible.
 */
export function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number") return value;
  // Dolibarr attend 0/1 sur ses colonnes booléennes.
  if (typeof value === "boolean") return value ? 1 : 0;
  // Cases à cocher, sélections multiples : une chaîne lisible dans l'ERP.
  if (Array.isArray(value)) {
    const parts = value.map((v) => normalizeValue(v)).filter((v) => v !== null);
    return parts.length ? parts.join(", ") : null;
  }
  if (value instanceof Date) return toDateString(value);
  // Objet non scalaire (ex. descripteur de fichier) : on refuse plutôt que
  // d'envoyer "[object Object]" dans la fiche adhérent.
  return null;
}

/** Format `YYYY-MM-DD`, celui qu'attendent les champs date de l'API Dolibarr. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Horodatage Unix en secondes — format des dates de cotisation. */
export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Écrit `value` dans `target` en interprétant la notation pointée.
 * `array_options.options_licence` crée `{ array_options: { options_licence } }`.
 */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return;

  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const existing = cursor[segment];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

// ---------------------------------------------------------------------------
//  Application du mapping
// ---------------------------------------------------------------------------

/**
 * Projette les réponses sur les propriétés Dolibarr décrites par `fieldMap`.
 * Les propriétés dont la source est vide sont omises : on ne veut pas écraser
 * une donnée déjà saisie dans l'ERP par une chaîne vide.
 */
export function applyFieldMap(fieldMap: FieldMap, values: ResponseValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [property, source] of Object.entries(fieldMap ?? {})) {
    const raw = source.source === "const" ? source.value : values[source.key];
    const normalized = normalizeValue(raw);
    if (normalized === null) continue;
    setPath(payload, property, normalized);
  }

  return payload;
}

/** Récupère une propriété éventuellement imbriquée d'une charge utile construite. */
function readPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, segment) => {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    return (cursor as Record<string, unknown>)[segment];
  }, payload);
}

/** Email retenu pour le rapprochement anti-doublon, en minuscules. */
export function extractEmail(payload: Record<string, unknown>): string | null {
  const email = readPath(payload, "email");
  return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
}

// ---------------------------------------------------------------------------
//  Charges utiles par type d'objet
// ---------------------------------------------------------------------------

/**
 * Fiche adhérent. `morphy` (personne physique/morale) et `statut` sont
 * obligatoires côté Dolibarr ; on fournit des valeurs par défaut cohérentes
 * pour un club, que le mapping peut écraser.
 */
export function buildMemberPayload(config: MappingConfig, values: ResponseValues): Record<string, unknown> {
  const payload = applyFieldMap(config.fieldMap, values);
  return {
    morphy: "phy",
    statut: 1,
    ...(config.memberTypeId != null ? { typeid: config.memberTypeId } : {}),
    ...payload,
  };
}

/**
 * Cotisation rattachée à un adhérent. Le montant provient soit d'un champ du
 * formulaire (paiement variable), soit d'une constante (tarif unique).
 */
export function buildSubscriptionPayload(
  config: MappingConfig,
  values: ResponseValues,
  now: Date = new Date(),
): { start_date: number; end_date: number; amount: number } | null {
  const amount = resolveSubscriptionAmount(config, values);
  if (amount === null) return null;

  const end = new Date(now);
  end.setMonth(end.getMonth() + (config.subscriptionMonths ?? 12));

  return { start_date: toUnixSeconds(now), end_date: toUnixSeconds(end), amount };
}

/** Montant de cotisation : le champ du formulaire prime sur le tarif fixe. */
export function resolveSubscriptionAmount(config: MappingConfig, values: ResponseValues): number | null {
  if (config.subscriptionAmountKey) {
    const raw = values[config.subscriptionAmountKey];
    // Les champs numériques peuvent revenir en chaîne ("25", "25,50").
    const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (config.subscriptionAmount != null && Number.isFinite(config.subscriptionAmount)) {
    return config.subscriptionAmount;
  }
  return null;
}

/**
 * Fiche tiers. Dolibarr exige un `name` : à défaut de mapping explicite, on le
 * reconstruit depuis le nom et le prénom pour ne pas rejeter la soumission.
 */
export function buildThirdPartyPayload(config: MappingConfig, values: ResponseValues): Record<string, unknown> {
  const payload = applyFieldMap(config.fieldMap, values);

  if (!payload.name) {
    const composed = [payload.firstname, payload.lastname].filter(Boolean).join(" ").trim();
    if (composed) payload.name = composed;
  }

  return { client: 1, status: 1, ...payload };
}

/** Contact rattaché au tiers `socid` créé juste avant. */
export function buildContactPayload(
  config: MappingConfig,
  values: ResponseValues,
  socid: number,
): Record<string, unknown> {
  const payload = applyFieldMap(config.fieldMap, values);
  // `name` appartient au tiers, pas au contact : il polluerait la fiche.
  delete payload.name;
  return { socid, statut: 1, ...payload };
}

// ---------------------------------------------------------------------------
//  Validation de la configuration
// ---------------------------------------------------------------------------

/** Propriétés Dolibarr sans lesquelles la création est refusée par l'ERP. */
const REQUIRED_PROPERTIES: Record<DolibarrTarget, string[]> = {
  MEMBER: ["lastname"],
  MEMBER_WITH_SUBSCRIPTION: ["lastname"],
  THIRDPARTY_CONTACT: [],
};

/**
 * Vérifie une configuration de mapping avant enregistrement. Mieux vaut
 * refuser ici que découvrir le problème à la première inscription réelle.
 */
export function validateMapping(config: MappingConfig, formFieldKeys: string[]): string[] {
  const errors: string[] = [];
  const mapped = Object.keys(config.fieldMap ?? {});

  for (const property of REQUIRED_PROPERTIES[config.target]) {
    if (!mapped.includes(property)) {
      errors.push(`La propriété Dolibarr « ${property} » doit être associée à un champ.`);
    }
  }

  // Un mapping qui pointe vers un champ supprimé du formulaire produit
  // silencieusement des fiches vides : on le signale.
  for (const [property, source] of Object.entries(config.fieldMap ?? {})) {
    if (source.source === "field" && !formFieldKeys.includes(source.key)) {
      errors.push(`« ${property} » référence le champ « ${source.key} », absent du formulaire.`);
    }
  }

  if (config.target !== "THIRDPARTY_CONTACT" && config.memberTypeId == null) {
    errors.push("Le type d'adhérent Dolibarr (memberTypeId) est requis pour créer un membre.");
  }

  if (config.target === "MEMBER_WITH_SUBSCRIPTION") {
    if (config.subscriptionAmount == null && !config.subscriptionAmountKey) {
      errors.push("Une cotisation exige un montant fixe ou un champ de formulaire portant le montant.");
    }
    if (config.subscriptionMonths != null && config.subscriptionMonths <= 0) {
      errors.push("La durée de cotisation doit être supérieure à zéro mois.");
    }
  }

  if (config.dedupeRequiresEmail && !mapped.includes("email")) {
    errors.push("Le rapprochement par email exige que la propriété « email » soit associée.");
  }

  return errors;
}
