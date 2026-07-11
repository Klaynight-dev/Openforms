import { prisma } from "../services/prisma.ts";
import { randomToken, sha256 } from "../services/crypto.ts";

/** Durée de validité d'un lien de définition de mot de passe. */
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48h

/**
 * Crée un nouveau jeton de définition de mot de passe pour un utilisateur,
 * en invalidant les jetons précédemment émis pour ce même compte.
 */
export async function createPasswordSetupToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  await prisma.passwordSetupToken.deleteMany({ where: { userId } });

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordSetupToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });

  return { token, expiresAt };
}

/** Résout un jeton en utilisateur cible, ou `null` si invalide/expiré. */
export async function resolvePasswordSetupToken(
  token: string,
): Promise<{ tokenId: string; userId: string; email: string } | null> {
  const record = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!record) return null;

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.passwordSetupToken.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }

  return { tokenId: record.id, userId: record.user.id, email: record.user.email };
}

/** Consomme (supprime) un jeton après utilisation. */
export async function consumePasswordSetupToken(tokenId: string): Promise<void> {
  await prisma.passwordSetupToken.delete({ where: { id: tokenId } }).catch(() => {});
}
