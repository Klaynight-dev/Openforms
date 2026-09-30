/**
 * Consentement RGPD découpé par finalité.
 *
 * Un consentement ne vaut que s'il est spécifique (art. 4.11 et 7 RGPD) : une
 * seule case « j'accepte tout » ne permet pas au répondant d'accepter la
 * collecte sans accepter, par exemple, la conservation longue. Le formulaire
 * peut donc lister plusieurs acceptations, chacune avec sa case, décochée à
 * l'ouverture. Sans liste, on garde la case unique d'avant.
 */
import { t } from "elysia";

// Des `type` et non des `interface` : Prisma n'accepte dans une colonne Json
// que des objets dont on sait qu'ils n'ont pas de propriétés cachées.
export type ConsentItem = {
  /** Identifiant stable : c'est lui que le répondant renvoie, pas le libellé. */
  id: string;
  label: string;
  /** Faux : le répondant peut refuser et soumettre quand même. */
  required: boolean;
};

/** Endroit du formulaire où s'affichent les cases : première ou dernière page. */
export type ConsentPosition = "START" | "END";

/** Trace enregistrée avec la réponse : ce qui a été proposé, et accepté ou non. */
export type ConsentRecord = {
  id: string;
  label: string;
  accepted: boolean;
};

export const DEFAULT_CONSENT_TEXT = "J'accepte que mes réponses soient traitées conformément au RGPD.";

export const ConsentItemSchema = t.Object({
  id: t.String({ minLength: 1, maxLength: 64 }),
  label: t.String({ minLength: 1, maxLength: 1000 }),
  required: t.Optional(t.Boolean()),
});

export const ConsentPositionSchema = t.Union([t.Literal("START"), t.Literal("END")]);

/** Lit la colonne Json `consentItems` : les entrées mal formées sont ignorées. */
export function parseConsentItems(raw: unknown): ConsentItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: ConsentItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, label, required } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    if (typeof label !== "string" || !label.trim()) continue;
    seen.add(id);
    items.push({ id, label: label.trim(), required: required !== false });
  }
  return items;
}

/**
 * Vérifie les acceptations envoyées avec une réponse et en tire la trace à
 * enregistrer.
 *
 * `consents` associe l'identifiant de chaque case à son état. Un appel d'API
 * qui n'envoie que `consent: true` (ancienne forme, MCP) vaut acceptation de
 * toutes les cases : c'est l'appelant qui atteste avoir recueilli l'accord.
 */
export function checkConsent(
  form: { requireConsent: boolean; consentText: string | null; consentItems: unknown },
  body: { consent?: boolean; consents?: Record<string, boolean> },
): { ok: true; record: ConsentRecord[] | null } | { ok: false; error: string } {
  if (!form.requireConsent) return { ok: true, record: null };

  const items = parseConsentItems(form.consentItems);
  if (items.length === 0) {
    if (body.consent !== true) return { ok: false, error: "Le consentement est requis pour soumettre." };
    return {
      ok: true,
      record: [{ id: "general", label: form.consentText?.trim() || DEFAULT_CONSENT_TEXT, accepted: true }],
    };
  }

  const acceptAll = body.consents === undefined && body.consent === true;
  const record = items.map((item) => ({
    id: item.id,
    label: item.label,
    accepted: acceptAll || body.consents?.[item.id] === true,
  }));
  const missing = items.filter((item, i) => item.required && !record[i]!.accepted);
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        missing.length === 1
          ? `Vous devez accepter : « ${missing[0]!.label} ».`
          : `Vous devez accepter les ${missing.length} autorisations obligatoires.`,
    };
  }
  return { ok: true, record };
}
