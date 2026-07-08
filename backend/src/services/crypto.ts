import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env.ts";

/**
 * Chiffrement authentifié AES-256-GCM des données sensibles au repos.
 * Format de sortie (base64) : iv(12) | authTag(16) | ciphertext.
 */
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptJson(value: unknown): string {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", env.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptJson<T = unknown>(payload: string): T {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", env.encryptionKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Enveloppe le contenu d'une réponse selon la politique de chiffrement du formulaire. */
export function sealContent(content: unknown, encrypt: boolean): Record<string, unknown> {
  return encrypt ? { __enc: encryptJson(content) } : (content as Record<string, unknown>);
}

/** Déchiffre le contenu si nécessaire, transparent pour l'appelant. */
export function openContent(stored: unknown): unknown {
  if (stored && typeof stored === "object" && "__enc" in (stored as object)) {
    return decryptJson((stored as { __enc: string }).__enc);
  }
  return stored;
}

// --- Hachage (identifiants non secrets : tokens de session, IP) ---

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash tronqué et salé d'une IP pour anti-abus sans stocker l'IP en clair. */
export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip + env.sessionSecret)
    .digest("hex")
    .slice(0, 32);
}

/** Comparaison à temps constant de deux chaînes hexadécimales de même longueur. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- Mots de passe (Argon2id natif Bun) ---

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// --- HMAC (intégrité des descripteurs de fichiers uploadés) ---

export function hmac(data: string): string {
  return createHmac("sha256", env.sessionSecret).update(data).digest("hex");
}

/** Signe un descripteur de fichier téléversé pour empêcher toute falsification. */
export function signDescriptor(descriptor: Record<string, unknown>): string {
  return hmac(JSON.stringify(descriptor));
}

export function verifyDescriptor(descriptor: Record<string, unknown>, signature: string): boolean {
  const expected = hmac(JSON.stringify(descriptor));
  return safeEqualHex(expected, signature);
}
