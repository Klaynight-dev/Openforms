/**
 * Chargement et validation stricte des variables d'environnement.
 * Le processus s'arrête immédiatement si une variable critique manque
 * ou est mal formée (fail-fast) — indispensable pour un déploiement sûr.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[env] Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function int(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// La clé de chiffrement doit décoder en 32 octets (AES-256).
const encryptionKeyRaw = required("ENCRYPTION_KEY");
const encryptionKey = Buffer.from(encryptionKeyRaw, "base64");
if (encryptionKey.length !== 32) {
  throw new Error(
    `[env] ENCRYPTION_KEY doit encoder 32 octets en base64 (AES-256), reçu ${encryptionKey.length}.`,
  );
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: int("PORT", 3000),
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: optional("NODE_ENV", "development") === "production",

  /** Liste blanche d'origines autorisées pour le CORS. */
  frontendOrigins: optional("FRONTEND_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /** Origine publique du frontend utilisée pour construire les liens envoyés par email (invitation, etc.). */
  get appUrl(): string {
    return optional("APP_URL", this.frontendOrigins[0] ?? "http://localhost:5173");
  },

  encryptionKey,
  sessionSecret: required("SESSION_SECRET"),
  sessionTtlSeconds: int("SESSION_TTL", 60 * 60 * 24 * 7),
  cookieSecure: bool("COOKIE_SECURE", false),

  uploadDir: optional("UPLOAD_DIR", "./uploads"),
  maxUploadBytes: int("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
} as const;

export type Env = typeof env;
