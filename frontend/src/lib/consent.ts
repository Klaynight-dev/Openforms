/**
 * Consentement RGPD côté répondant : même règle que backend/src/lib/consent.ts.
 *
 * Module sans dépendance à Svelte : le widget d'intégration (embed/widget.ts)
 * l'importe aussi, pour que les trois rendus du formulaire bloquent sur les
 * mêmes cases.
 */
import type { ConsentItem, ConsentPosition } from "./types.ts";

export const DEFAULT_CONSENT_TEXT = "J'accepte que mes réponses soient traitées conformément au RGPD.";

/** Texte d'introduction quand le formulaire liste plusieurs acceptations. */
export const DEFAULT_CONSENT_INTRO =
  "Chaque autorisation est distincte : cochez celles que vous acceptez.";

/** Finalités proposées en un clic dans les paramètres du formulaire. */
export const CONSENT_PRESETS: ConsentItem[] = [
  {
    id: "collecte",
    label: "J'accepte la collecte de mes réponses et des données que je renseigne dans ce questionnaire.",
    required: true,
  },
  {
    id: "traitement",
    label: "J'accepte le traitement de ces données pour l'analyse et la production des résultats de l'étude.",
    required: true,
  },
  {
    id: "stockage",
    label: "J'accepte que ces données soient conservées de manière sécurisée pendant la durée indiquée dans la politique de confidentialité.",
    required: true,
  },
];

interface ConsentForm {
  requireConsent: boolean;
  consentText?: string | null;
  consentItems?: ConsentItem[];
  consentPosition?: ConsentPosition;
}

/** Vrai si les cases s'affichent sur cette page (première ou dernière). */
export function consentOnPage(form: ConsentForm, page: { isFirst: boolean; isLast: boolean }): boolean {
  if (!form.requireConsent) return false;
  return form.consentPosition === "START" ? page.isFirst : page.isLast;
}

/**
 * Message à afficher si une acceptation obligatoire manque, sinon `null`.
 * `consent` est la case unique, `consents` l'état des cases par identifiant.
 */
export function missingConsent(
  form: ConsentForm,
  consent: boolean,
  consents: Record<string, boolean>,
): string | null {
  if (!form.requireConsent) return null;
  const items = form.consentItems ?? [];
  if (items.length === 0) return consent ? null : "Vous devez accepter le consentement pour continuer.";
  const missing = items.filter((item) => item.required && !consents[item.id]);
  if (missing.length === 0) return null;
  return missing.length === 1
    ? "Une autorisation obligatoire n'est pas cochée."
    : `${missing.length} autorisations obligatoires ne sont pas cochées.`;
}

/** Champs de consentement à joindre à la soumission. */
export function consentPayload(
  form: ConsentForm,
  consent: boolean,
  consents: Record<string, boolean>,
): { consent?: boolean; consents?: Record<string, boolean> } {
  const items = form.consentItems ?? [];
  if (!form.requireConsent || items.length === 0) return { consent };
  // Chaque case est envoyée, cochée ou non : la réponse garde trace des refus.
  return { consents: Object.fromEntries(items.map((item) => [item.id, consents[item.id] === true])) };
}

/** Identifiant libre pour une nouvelle acceptation, dérivé de son libellé. */
export function newConsentId(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "acceptation";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
