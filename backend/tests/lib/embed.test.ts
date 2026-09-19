/**
 * Contrôle d'origine de l'intégration.
 *
 * Une liste d'origines mal interprétée se remarque tard : soit le formulaire
 * refuse un site légitime, soit- bien pire- il accepte n'importe qui alors
 * que l'administrateur croit l'avoir restreint.
 */
import { describe, expect, it } from "bun:test";
import {
  checkEmbedAccess,
  frameAncestors,
  isEmbedOriginAllowed,
  normalizeOrigin,
  parseEmbedOrigins,
  sanitizeEmbedOrigins,
} from "../../src/lib/embed.ts";

describe("normalizeOrigin", () => {
  it("complète le schéma manquant", () => {
    expect(normalizeOrigin("exemple.org")).toBe("https://exemple.org");
  });

  it("retire le chemin collé par erreur", () => {
    expect(normalizeOrigin("https://exemple.org/contact?x=1")).toBe("https://exemple.org");
  });

  it("conserve le port et le schéma http", () => {
    expect(normalizeOrigin("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("accepte un joker de sous-domaine", () => {
    expect(normalizeOrigin("https://*.exemple.org")).toBe("https://*.exemple.org");
  });

  it("refuse ce qui n'est pas une origine", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("*")).toBeNull();
  });
});

describe("parseEmbedOrigins", () => {
  it("ignore les entrées mal formées et dédoublonne", () => {
    expect(parseEmbedOrigins(["exemple.org", "https://exemple.org", 42, "*"])).toEqual([
      "https://exemple.org",
    ]);
  });

  it("renvoie une liste vide pour une colonne absente", () => {
    expect(parseEmbedOrigins(null)).toEqual([]);
    expect(parseEmbedOrigins({})).toEqual([]);
  });
});

describe("sanitizeEmbedOrigins", () => {
  it("signale les saisies refusées au lieu de les avaler", () => {
    const { origins, rejected } = sanitizeEmbedOrigins(["exemple.org", "  ", "pas une url !"]);
    expect(origins).toEqual(["https://exemple.org"]);
    expect(rejected).toEqual(["pas une url !"]);
  });
});

describe("isEmbedOriginAllowed", () => {
  const allowed = ["https://exemple.org", "https://*.partenaire.fr"];

  it("laisse tout passer quand aucune origine n'est déclarée", () => {
    expect(isEmbedOriginAllowed("https://n-importe-qui.test", [])).toBe(true);
  });

  it("accepte une origine listée", () => {
    expect(isEmbedOriginAllowed("https://exemple.org", allowed)).toBe(true);
  });

  it("accepte un sous-domaine couvert par un joker", () => {
    expect(isEmbedOriginAllowed("https://www.partenaire.fr", allowed)).toBe(true);
  });

  it("refuse le domaine nu d'un joker", () => {
    expect(isEmbedOriginAllowed("https://partenaire.fr", allowed)).toBe(false);
  });

  it("refuse un domaine qui se contente de finir pareil", () => {
    expect(isEmbedOriginAllowed("https://exemple.org.attaquant.test", allowed)).toBe(false);
  });

  it("refuse un changement de schéma", () => {
    expect(isEmbedOriginAllowed("http://exemple.org", allowed)).toBe(false);
  });

  it("ne restreint pas un appel sans en-tête Origin (serveur à serveur)", () => {
    expect(isEmbedOriginAllowed(null, allowed)).toBe(true);
  });
});

describe("checkEmbedAccess", () => {
  it("refuse tout site externe quand l'intégration est coupée", () => {
    const refusal = checkEmbedAccess({ embedEnabled: false, embedOrigins: [] }, "https://exemple.org");
    expect(refusal?.status).toBe(403);
  });

  it("laisse passer une origine autorisée", () => {
    expect(
      checkEmbedAccess({ embedEnabled: true, embedOrigins: ["https://exemple.org"] }, "https://exemple.org"),
    ).toBeNull();
  });

  it("refuse une origine hors liste", () => {
    expect(
      checkEmbedAccess({ embedEnabled: true, embedOrigins: ["https://exemple.org"] }, "https://autre.test"),
    ).not.toBeNull();
  });
});

describe("frameAncestors", () => {
  it("interdit tout cadre quand l'intégration est coupée", () => {
    expect(frameAncestors(["https://exemple.org"], false)).toBe("'none'");
  });

  it("ouvre à tous sans liste déclarée", () => {
    expect(frameAncestors([], true)).toBe("*");
  });

  it("énumère les origines déclarées, instance comprise", () => {
    expect(frameAncestors(["https://exemple.org"], true)).toBe("'self' https://exemple.org");
  });
});
