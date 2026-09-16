import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin, resolveFormPermission } from "../middleware/auth.ts";
import { recordFormVersion, snapshotToUpdateData } from "../lib/formVersion.ts";

/**
 * Historique d'un formulaire : consultation des versions et restauration.
 * Réservé aux éditeurs- c'est un outil d'édition, et les instantanés
 * exposent des réglages que les lecteurs n'ont pas à parcourir.
 */
export const formVersionController = new Elysia({ prefix: "/api/v1/forms" })
  .use(authPlugin)

  // --- Liste des versions (sans les instantanés, trop volumineux) ---
  .get(
    "/:id/versions",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "EDITOR") {
        set.status = 403;
        return { success: false, error: "Historique réservé aux éditeurs." };
      }

      const versions = await prisma.formVersion.findMany({
        where: { formId: form.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          author: { select: { id: true, email: true, displayName: true } },
        },
      });
      return { success: true, versions };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Restauration d'une version ---
  .post(
    "/:id/versions/:versionId/restore",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "EDITOR") {
        set.status = 403;
        return { success: false, error: "Restauration non autorisée." };
      }

      const version = await prisma.formVersion.findFirst({
        where: { id: params.versionId, formId: form.id },
      });
      if (!version) {
        set.status = 404;
        return { success: false, error: "Version introuvable." };
      }

      // Une restauration est une modification comme une autre : l'état courant
      // doit rester récupérable si elle s'avère être une fausse manœuvre.
      await recordFormVersion(form, auth!.user.id);

      const updated = await prisma.form.update({
        where: { id: form.id },
        data: snapshotToUpdateData(version.snapshot),
      });
      return { success: true, form: updated };
    },
    {
      params: t.Object({ id: t.String(), versionId: t.String() }),
      requireRole: true,
    },
  );
