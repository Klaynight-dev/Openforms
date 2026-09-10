import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";
import { createApiKey } from "../lib/apiKey.ts";

/**
 * Clés d'API personnelles (serveur MCP, scripts).
 * Une clé porte exactement les droits de son titulaire : les contrôles
 * d'accès aux formulaires et aux organisations restent inchangés.
 */
export const apiKeyController = new Elysia({ prefix: "/api/v1/api-keys" })
  .use(authPlugin)

  // --- Liste (jamais le secret) ---
  .get(
    "/",
    async ({ auth }) => {
      const keys = await prisma.apiKey.findMany({
        where: { userId: auth!.user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      });
      return { success: true, keys };
    },
    { requireRole: true },
  )

  // --- Création : le token en clair n'est renvoyé qu'ici, une seule fois ---
  .post(
    "/",
    async ({ auth, body, set }) => {
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        set.status = 422;
        return { success: false, error: "Date d'expiration invalide." };
      }

      const { id, token } = await createApiKey(auth!.user.id, body.name.trim(), expiresAt);
      return {
        success: true,
        key: { id, name: body.name.trim(), expiresAt: expiresAt ?? null },
        token,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        expiresAt: t.Optional(t.String()),
      }),
      requireRole: true,
    },
  )

  // --- Révocation ---
  .delete(
    "/:id",
    async ({ auth, params, set }) => {
      const key = await prisma.apiKey.findUnique({ where: { id: params.id } });
      if (!key || key.userId !== auth!.user.id) {
        set.status = 404;
        return { success: false, error: "Clé introuvable." };
      }
      await prisma.apiKey.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
