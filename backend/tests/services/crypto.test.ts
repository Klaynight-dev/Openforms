import { describe, expect, test } from "bun:test";
import {
  decryptJson,
  encryptJson,
  hashIp,
  hashPassword,
  openContent,
  randomToken,
  safeEqualHex,
  sealContent,
  sha256,
  signDescriptor,
  verifyDescriptor,
  verifyPassword,
} from "../../src/services/crypto.ts";

describe("chiffrement AES-256-GCM", () => {
  test("un aller-retour restitue la valeur d'origine", () => {
    const value = { nom: "Ada", scores: [1, 2, 3], nested: { ok: true }, accents: "éàü" };
    expect(decryptJson(encryptJson(value))).toEqual(value);
  });

  test("deux chiffrements de la même valeur diffèrent (IV aléatoire)", () => {
    const value = { a: 1 };
    expect(encryptJson(value)).not.toBe(encryptJson(value));
  });

  test("le déchiffrement échoue si le texte chiffré est altéré", () => {
    const payload = Buffer.from(encryptJson({ solde: 100 }), "base64");
    // Le dernier octet appartient au texte chiffré : le tag GCM doit le détecter.
    payload[payload.length - 1] ^= 0xff;
    expect(() => decryptJson(payload.toString("base64"))).toThrow();
  });

  test("le déchiffrement échoue si le tag d'authentification est altéré", () => {
    const payload = Buffer.from(encryptJson({ solde: 100 }), "base64");
    payload[13] ^= 0xff; // octet situé dans le authTag (offset 12..27)
    expect(() => decryptJson(payload.toString("base64"))).toThrow();
  });
});

describe("sealContent / openContent", () => {
  test("laisse le contenu en clair lorsque le chiffrement est désactivé", () => {
    const content = { q1: "réponse" };
    const sealed = sealContent(content, false);
    expect(sealed).toEqual(content);
    expect(openContent(sealed)).toEqual(content);
  });

  test("enveloppe le contenu et le restitue lorsque le chiffrement est activé", () => {
    const content = { q1: "réponse sensible" };
    const sealed = sealContent(content, true);
    expect(sealed).toHaveProperty("__enc");
    expect(JSON.stringify(sealed)).not.toContain("sensible");
    expect(openContent(sealed)).toEqual(content);
  });

  test("openContent est idempotent sur une valeur déjà en clair", () => {
    expect(openContent({ a: 1 })).toEqual({ a: 1 });
    expect(openContent(null)).toBeNull();
  });
});

describe("hachage", () => {
  test("sha256 est déterministe et de longueur fixe", () => {
    expect(sha256("openforms")).toBe(sha256("openforms"));
    expect(sha256("openforms")).toHaveLength(64);
    expect(sha256("openforms")).not.toBe(sha256("openform"));
  });

  test("hashIp est déterministe, tronqué, et ne contient pas l'IP", () => {
    const hash = hashIp("203.0.113.42");
    expect(hash).toBe(hashIp("203.0.113.42"));
    expect(hash).toHaveLength(32);
    expect(hash).not.toContain("203");
    expect(hash).not.toBe(hashIp("203.0.113.43"));
  });
});

describe("safeEqualHex", () => {
  test("compare deux chaînes hexadécimales identiques", () => {
    expect(safeEqualHex(sha256("a"), sha256("a"))).toBe(true);
  });

  test("rejette des valeurs différentes ou de longueurs différentes", () => {
    expect(safeEqualHex(sha256("a"), sha256("b"))).toBe(false);
    expect(safeEqualHex("abcd", "ab")).toBe(false);
  });
});

describe("mots de passe Argon2id", () => {
  test("vérifie le bon mot de passe et rejette les autres", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toStartWith("$argon2id$");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("mauvais mot de passe", hash)).toBe(false);
  });

  test("deux hachages du même mot de passe diffèrent (sel aléatoire)", async () => {
    expect(await hashPassword("identique")).not.toBe(await hashPassword("identique"));
  });
});

describe("randomToken", () => {
  test("produit des jetons url-safe et distincts", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("signature des descripteurs de fichier", () => {
  test("valide un descripteur intact", () => {
    const descriptor = { name: "cv.pdf", size: 1024, mime: "application/pdf" };
    expect(verifyDescriptor(descriptor, signDescriptor(descriptor))).toBe(true);
  });

  test("rejette un descripteur falsifié", () => {
    const descriptor = { name: "cv.pdf", size: 1024, mime: "application/pdf" };
    const signature = signDescriptor(descriptor);
    expect(verifyDescriptor({ ...descriptor, name: "../../etc/passwd" }, signature)).toBe(false);
    expect(verifyDescriptor({ ...descriptor, size: 999999 }, signature)).toBe(false);
  });

  test("rejette une signature qui n'est pas de l'hexadécimal valide", () => {
    expect(verifyDescriptor({ a: 1 }, "pas-une-signature")).toBe(false);
  });
});
