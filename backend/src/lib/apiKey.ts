import { prisma } from "../services/prisma.ts";
import { randomToken, sha256 } from "../services/crypto.ts";
import type { SessionContext } from "./session.ts";

/** Préfixe lisible permettant de reconnaître une clé Openforms dans un fichier de config. */
const KEY_PREFIX = "ofk_";
/**
 * Préfixe distinct pour les clés d'embed : elles vivent en clair dans le code
 * d'une page tierce, il faut pouvoir les reconnaître d'un coup d'œil et ne
 * jamais les confondre avec une clé pleine lors d'une fuite.
 */
const EMBED_PREFIX = "ofe_";

/** Portée d'une clé : compte entier, ou un seul formulaire en lecture/soumission. */
export type ApiKeyScope = "FULL" | "EMBED";

/** Identité d'une clé, jointe au contexte d'authentification. */
export interface ApiKeyContext {
  id: string;
  scope: ApiKeyScope;
  /** Formulaire auquel la clé est restreinte (scope EMBED uniquement). */
  formId: string | null;
}

/**
 * Crée une clé d'API et renvoie le token en clair- il n'est **jamais**
 * restitué ensuite, seul son SHA-256 est conservé.
 */
export async function createApiKey(
  userId: string,
  name: string,
  options: { expiresAt?: Date; scope?: ApiKeyScope; formId?: string | null } = {},
): Promise<{ id: string; token: string }> {
  const scope = options.scope ?? "FULL";
  const token = (scope === "EMBED" ? EMBED_PREFIX : KEY_PREFIX) + randomToken(32);
  const key = await prisma.apiKey.create({
    data: {
      userId,
      name,
      tokenHash: sha256(token),
      expiresAt: options.expiresAt ?? null,
      scope,
      formId: scope === "EMBED" ? (options.formId ?? null) : null,
    },
  });
  return { id: key.id, token };
}

/**
 * Résout un token Bearer en contexte utilisateur, ou null si invalide/expiré.
 * Renvoie la même forme que `resolveSession` pour que les contrôleurs n'aient
 * pas à distinguer les deux modes d'authentification, augmentée de `apiKey`
 * pour que les gardes sachent jusqu'où la clé porte.
 */
export async function resolveApiKey(
  token: string | undefined,
): Promise<(SessionContext & { apiKey: ApiKeyContext }) | null> {
  if (!token) return null;
  if (!token.startsWith(KEY_PREFIX) && !token.startsWith(EMBED_PREFIX)) return null;

  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!key) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
  if (!key.user.isActive) return null;

  const scope: ApiKeyScope = key.scope === "EMBED" ? "EMBED" : "FULL";
  // Une clé d'embed sans formulaire cible n'autoriserait rien du tout : elle
  // ne peut provenir que d'une donnée corrompue, on la refuse.
  if (scope === "EMBED" && !key.formId) return null;

  // Trace de dernière utilisation, sans bloquer la requête.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    // Une clé d'API n'ouvre pas de session cookie : pas de secret CSRF exploitable.
    session: { id: `apikey:${key.id}`, csrfSecret: "", expiresAt: key.expiresAt ?? new Date(8640000000000000) },
    user: {
      id: key.user.id,
      email: key.user.email,
      role: key.user.role,
      displayName: key.user.displayName,
    },
    apiKey: { id: key.id, scope, formId: key.formId },
  };
}
