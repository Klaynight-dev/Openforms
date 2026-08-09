/**
 * Préchargé par `bun test` (voir bunfig.toml).
 *
 * `src/config/env.ts` valide l'environnement à l'import et fait planter le
 * processus s'il manque une variable — on renseigne donc des valeurs de test
 * déterministes AVANT que le moindre module applicatif ne soit chargé.
 *
 * Les valeurs ci-dessous ne sont jamais des secrets réels : elles n'existent
 * que dans le processus de test.
 */

process.env.NODE_ENV ??= "test";

// 32 octets de zéros en base64 → clé AES-256 valide et reproductible.
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_SECRET ??= "test-session-secret-not-used-in-production";

/**
 * Les tests d'intégration ont besoin d'une vraie base jetable. On accepte
 * DATABASE_URL_TEST pour éviter qu'un DATABASE_URL de développement pointant
 * vers des données réelles ne soit tronqué par erreur.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/openforms_test";

process.env.FRONTEND_ORIGIN ??= "http://localhost:5173";
process.env.UPLOAD_DIR ??= "./.test-uploads";
process.env.STORAGE_DRIVER ??= "local";

/** Vrai uniquement si l'on dispose d'une base jetable explicitement désignée. */
export const hasTestDatabase = Boolean(process.env.DATABASE_URL_TEST);
