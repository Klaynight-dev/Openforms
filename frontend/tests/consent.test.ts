/**
 * Consentement côté répondant : doit bloquer exactement comme l'API
 * (backend/src/lib/consent.ts), sinon le visiteur découvre le refus après
 * avoir tout rempli, ou n'est jamais bloqué alors qu'il devrait l'être.
 */
import { describe, expect, it } from "bun:test";
import { consentOnPage, consentPayload, missingConsent, newConsentId } from "../src/lib/consent.ts";

const items = [
  { id: "collecte", label: "Collecte", required: true },
  { id: "stockage", label: "Stockage", required: false },
];
const form = { requireConsent: true, consentItems: items };

describe("consentOnPage", () => {
  const first = { isFirst: true, isLast: false };
  const last = { isFirst: false, isLast: true };

  it("place les cases en fin de formulaire par défaut", () => {
    expect(consentOnPage(form, first)).toBe(false);
    expect(consentOnPage(form, last)).toBe(true);
  });

  it("les place sur la première page si demandé", () => {
    expect(consentOnPage({ ...form, consentPosition: "START" }, first)).toBe(true);
    expect(consentOnPage({ ...form, consentPosition: "START" }, last)).toBe(false);
  });

  it("n'affiche rien si le consentement n'est pas exigé", () => {
    expect(consentOnPage({ ...form, requireConsent: false }, last)).toBe(false);
  });
});

describe("missingConsent", () => {
  it("bloque tant qu'une case obligatoire est décochée", () => {
    expect(missingConsent(form, false, {})).not.toBeNull();
    expect(missingConsent(form, false, { stockage: true })).not.toBeNull();
  });

  it("laisse passer le refus d'une case facultative", () => {
    expect(missingConsent(form, false, { collecte: true })).toBeNull();
  });

  it("garde la case unique sans acceptation listée", () => {
    expect(missingConsent({ requireConsent: true }, false, {})).not.toBeNull();
    expect(missingConsent({ requireConsent: true }, true, {})).toBeNull();
  });
});

describe("consentPayload", () => {
  it("envoie chaque case, refus compris", () => {
    expect(consentPayload(form, false, { collecte: true })).toEqual({
      consents: { collecte: true, stockage: false },
    });
  });

  it("envoie la case unique telle quelle", () => {
    expect(consentPayload({ requireConsent: true }, true, {})).toEqual({ consent: true });
  });
});

describe("newConsentId", () => {
  it("dérive l'identifiant du libellé, sans accents", () => {
    expect(newConsentId("Durée de conservation", [])).toBe("duree-de-conservation");
  });

  it("évite les identifiants déjà pris", () => {
    expect(newConsentId("", ["acceptation", "acceptation-2"])).toBe("acceptation-3");
  });
});
