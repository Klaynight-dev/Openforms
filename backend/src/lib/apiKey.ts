import { prisma } from "../services/prisma.ts";
import { randomToken, sha256 } from "../services/crypto.ts";
import type { SessionContext } from "./session.ts";

/** Préfixe lisible permettant de reconnaître une clé Openforms dans un fichier de config. */
const KEY_PREFIX = "ofk_";

/**
 * Crée une clé d'API et renvoie le token en clair- il n'est **jamais**
 * restitué ensuite, seul son SHA-256 est conservé.
 */
export async function createApiKey(
  userId: string,
  name: string,
  expiresAt?: Date,
): Promise<{ id: string; token: string }> {
  const token = KEY_PREFIX + randomToken(32);
  const key = await prisma.apiKey.create({
    data: { userId, name, tokenHash: sha256(token), expiresAt: expiresAt ?? null },
  });
  return { id: key.id, token };
}

/**
 * Résout un token Bearer en contexte utilisateur, ou null si invalide/expiré.
 * Renvoie la même forme que `resolveSession` pour que les contrôleurs n'aient
 * pas à distinguer les deux modes d'authentification.
 */
export async function resolveApiKey(token: string | undefined): Promise<SessionContext | null> {
  if (!token || !token.startsWith(KEY_PREFIX)) return null;

  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!key) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
  if (!key.user.isActive) return null;

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
  };
}
