/**
 * Intégration d'un formulaire dans un site tiers.
 *
 * Un formulaire porte une liste d'origines autorisées (`Form.embedOrigins`).
 * Elle sert deux contrôles distincts :
 *  - côté API : rejet d'une lecture ou d'une soumission émise depuis une page
 *    non autorisée (en-tête `Origin`) ;
 *  - côté page d'embed : construction de la directive CSP `frame-ancestors`,
 *    seul mécanisme que le navigateur applique réellement à un `<iframe>`.
 *
 * Liste vide = aucune restriction : le formulaire s'intègre partout, ce qui
 * reste le comportement attendu d'un formulaire public.
 */

/** Origine acceptée : `https://exemple.org` ou `https://*.exemple.org`. */
const ORIGIN_PATTERN = /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i;

/**
 * Ramène une saisie libre à une origine canonique, ou `null` si elle n'en est
 * pas une. Tolère l'absence de schéma (`exemple.org`) et un chemin en trop
 * (`https://exemple.org/contact`), deux erreurs de copier-coller courantes.
 */
export function normalizeOrigin(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  // Un navigateur envoie `Origin: null` pour une origine opaque (iframe
  // `sandbox`, page `file://`) : ce n'est pas un hôte nommé « null ».
  if (value === "null") return null;
  if (!/^https?:\/\//.test(value)) value = `https://${value}`;

  // Un joker de sous-domaine n'est pas une URL valide : on l'isole le temps de
  // l'analyse, puis on le replace sur l'origine normalisée.
  const wildcard = value.startsWith("https://*.") || value.startsWith("http://*.");
  const probe = wildcard ? value.replace("://*.", "://") : value;

  let origin: string;
  try {
    origin = new URL(probe).origin;
  } catch {
    return null;
  }
  if (origin === "null") return null;

  const result = wildcard ? origin.replace("://", "://*.") : origin;
  return ORIGIN_PATTERN.test(result) ? result : null;
}

/** Lit la colonne Json `embedOrigins` en ignorant toute valeur mal formée. */
export function parseEmbedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const origins: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeOrigin(entry);
    if (normalized && !origins.includes(normalized)) origins.push(normalized);
  }
  return origins;
}

/** Normalise et dédoublonne une liste saisie par un administrateur. */
export function sanitizeEmbedOrigins(values: string[]): { origins: string[]; rejected: string[] } {
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const raw of values) {
    if (!raw.trim()) continue;
    const normalized = normalizeOrigin(raw);
    if (!normalized) rejected.push(raw.trim());
    else if (!origins.includes(normalized)) origins.push(normalized);
  }
  return { origins, rejected };
}

/** Vrai si `origin` est couverte par une entrée de la liste (joker compris). */
function matches(origin: string, allowed: string): boolean {
  if (origin === allowed) return true;
  if (!allowed.includes("://*.")) return false;
  const [scheme, host] = allowed.split("://*.");
  // `*.exemple.org` couvre les sous-domaines, pas le domaine nu.
  return origin.startsWith(`${scheme}://`) && origin.endsWith(`.${host}`);
}

/**
 * Vérifie l'en-tête `Origin` d'une requête d'embed.
 * Une origine absente (appel serveur à serveur, curl) n'est pas un embed : la
 * restriction ne s'applique qu'aux requêtes émises par une page web.
 */
export function isEmbedOriginAllowed(origin: string | null | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowed.some((entry) => matches(normalized, entry));
}

/**
 * Valeur de la directive CSP `frame-ancestors` pour la page d'embed.
 * Liste vide = `*` (intégrable partout) ; `embedEnabled` à `false` = `'none'`.
 */
export function frameAncestors(allowed: string[], enabled: boolean): string {
  if (!enabled) return "'none'";
  if (allowed.length === 0) return "*";
  return ["'self'", ...allowed].join(" ");
}

/** Formulaire vu par les contrôles d'embed. */
export interface EmbeddableForm {
  embedEnabled: boolean;
  embedOrigins: unknown;
}

/**
 * Vérifie qu'un site tiers a le droit d'afficher ou de soumettre ce
 * formulaire. Renvoie `null` si l'accès est permis, sinon le refus à
 * retourner tel quel au client.
 */
export function checkEmbedAccess(
  form: EmbeddableForm,
  origin: string | null | undefined,
): { status: number; error: string } | null {
  if (!form.embedEnabled) {
    return {
      status: 403,
      error: "L'intégration de ce formulaire sur un site externe est désactivée.",
    };
  }
  if (!isEmbedOriginAllowed(origin, parseEmbedOrigins(form.embedOrigins))) {
    return {
      status: 403,
      error: "Ce site n'est pas autorisé à intégrer ce formulaire.",
    };
  }
  return null;
}
