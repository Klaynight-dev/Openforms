import { prisma } from "../services/prisma.ts";
import { env } from "../config/env.ts";
import { randomToken, sha256, hashIp } from "../services/crypto.ts";

export interface SessionContext {
  session: {
    id: string;
    csrfSecret: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    role: "SUPER_ADMIN" | "EDITOR";
    displayName: string | null;
  };
}

/**
 * Crée une session serveur et renvoie le token opaque à placer dans le
 * cookie HttpOnly ainsi que le secret CSRF à exposer au client.
 */
export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; csrfSecret: string; expiresAt: Date }> {
  const token = randomToken(32);
  const csrfSecret = randomToken(24);
  const expiresAt = new Date(Date.now() + env.sessionTtlSeconds * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfSecret,
      userAgent: meta.userAgent?.slice(0, 300),
      ipHash: meta.ip ? hashIp(meta.ip) : null,
      expiresAt,
    },
  });

  return { token, csrfSecret, expiresAt };
}

/** Résout un token de cookie en session + utilisateur, ou null si invalide/expiré. */
export async function resolveSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (!session.user.isActive) return null;

  return {
    session: { id: session.id, csrfSecret: session.csrfSecret, expiresAt: session.expiresAt },
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      displayName: session.user.displayName,
    },
  };
}

/** Invalide une session (déconnexion). */
export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

/** Purge les sessions expirées (à appeler périodiquement). */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
