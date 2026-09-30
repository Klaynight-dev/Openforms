/**
 * Consentement par finalité.
 *
 * Une case obligatoire qui laisse passer une réponse non cochée, et la réponse
 * est enregistrée sans base légale ; l'inverse bloque des répondants qui ont
 * pourtant tout accepté.
 */
import { describe, expect, it } from "bun:test";
import { checkConsent, DEFAULT_CONSENT_TEXT, parseConsentItems } from "../../src/lib/consent.ts";

const items = [
  { id: "collecte", label: "Collecte de mes réponses", required: true },
  { id: "traitement", label: "Traitement statistique", required: true },
  { id: "stockage", label: "Conservation 3 ans", required: false },
];

const form = (over: Partial<Parameters<typeof checkConsent>[0]> = {}) => ({
  requireConsent: true,
  consentText: null,
  consentItems: items,
  ...over,
});

describe("parseConsentItems", () => {
  it("écarte les entrées sans libellé et les identifiants en double", () => {
    expect(
      parseConsentItems([
        { id: "a", label: "A" },
        { id: "a", label: "Doublon" },
        { id: "b", label: "   " },
        null,
        "texte",
      ]),
    ).toEqual([{ id: "a", label: "A", required: true }]);
  });

  it("rend une case obligatoire sauf mention contraire", () => {
    expect(parseConsentItems([{ id: "a", label: "A", required: false }])[0]!.required).toBe(false);
  });

  it("ignore une valeur qui n'est pas une liste", () => {
    expect(parseConsentItems({})).toEqual([]);
  });
});

describe("checkConsent", () => {
  it("ne demande rien si le formulaire n'exige pas de consentement", () => {
    expect(checkConsent(form({ requireConsent: false }), {})).toEqual({ ok: true, record: null });
  });

  it("garde la case unique quand aucune finalité n'est listée", () => {
    expect(checkConsent(form({ consentItems: [] }), {}).ok).toBe(false);
    expect(checkConsent(form({ consentItems: [] }), { consent: true })).toEqual({
      ok: true,
      record: [{ id: "general", label: DEFAULT_CONSENT_TEXT, accepted: true }],
    });
  });

  it("refuse une case obligatoire non cochée", () => {
    const result = checkConsent(form(), { consents: { collecte: true } });
    expect(result).toEqual({ ok: false, error: "Vous devez accepter : « Traitement statistique »." });
  });

  it("accepte le refus d'une case facultative et l'enregistre", () => {
    const result = checkConsent(form(), { consents: { collecte: true, traitement: true } });
    expect(result).toEqual({
      ok: true,
      record: [
        { id: "collecte", label: "Collecte de mes réponses", accepted: true },
        { id: "traitement", label: "Traitement statistique", accepted: true },
        { id: "stockage", label: "Conservation 3 ans", accepted: false },
      ],
    });
  });

  it("ne compte pas `consent: true` quand les cases sont envoyées une à une", () => {
    expect(checkConsent(form(), { consent: true, consents: {} }).ok).toBe(false);
  });

  it("traite `consent: true` seul comme l'acceptation de toutes les cases", () => {
    const result = checkConsent(form(), { consent: true });
    expect(result.ok && result.record?.every((r) => r.accepted)).toBe(true);
  });
});
