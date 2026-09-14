import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin, resolveFormPermission } from "../middleware/auth.ts";

/**
 * Commentaires sur un formulaire (cercle 1) : lisibles par tout collaborateur
 * (VIEWER, COMMENTER, EDITOR, propriétaire ou SUPER_ADMIN), postables
 * uniquement à partir de COMMENTER. La suppression/résolution reste ouverte
 * à l'auteur du commentaire ou à un éditeur du formulaire.
 */
export const commentController = new Elysia({ prefix: "/api/v1" })
  .use(authPlugin)

  // --- Liste des commentaires d'un formulaire ---
  .get(
    "/forms/:id/comments",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }
      const comments = await prisma.comment.findMany({
        where: { formId: form.id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, email: true, displayName: true } } },
      });
      return { success: true, comments };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Ajouter un commentaire (COMMENTER ou EDITOR) ---
  .post(
    "/forms/:id/comments",
    async ({ auth, params, body, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "COMMENTER" && perm !== "EDITOR") {
        set.status = 403;
        return { success: false, error: "Seuls les commentateurs et éditeurs peuvent commenter." };
      }
      const comment = await prisma.comment.create({
        data: { formId: form.id, authorId: auth!.user.id, body: body.body.trim() },
        include: { author: { select: { id: true, email: true, displayName: true } } },
      });
      set.status = 201;
      return { success: true, comment };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ body: t.String({ minLength: 1, maxLength: 4000 }) }),
      requireRole: true,
    },
  )

  // --- Marquer un commentaire comme résolu / non résolu ---
  .patch(
    "/comments/:commentId/resolve",
    async ({ auth, params, body, set }) => {
      const comment = await prisma.comment.findUnique({
        where: { id: params.commentId },
        include: { form: { select: { id: true, ownerId: true } } },
      });
      if (!comment) {
        set.status = 404;
        return { success: false, error: "Commentaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, comment.form.id, comment.form.ownerId);
      const isAuthor = comment.authorId === auth!.user.id;
      if (!isAuthor && perm !== "COMMENTER" && perm !== "EDITOR") {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }
      const updated = await prisma.comment.update({
        where: { id: params.commentId },
        data: { resolved: body.resolved },
      });
      return { success: true, comment: updated };
    },
    {
      params: t.Object({ commentId: t.String() }),
      body: t.Object({ resolved: t.Boolean() }),
      requireRole: true,
    },
  )

  // --- Supprimer un commentaire (auteur, éditeur du formulaire, ou SUPER_ADMIN) ---
  .delete(
    "/comments/:commentId",
    async ({ auth, params, set }) => {
      const comment = await prisma.comment.findUnique({
        where: { id: params.commentId },
        include: { form: { select: { id: true, ownerId: true } } },
      });
      if (!comment) {
        set.status = 404;
        return { success: false, error: "Commentaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, comment.form.id, comment.form.ownerId);
      const isAuthor = comment.authorId === auth!.user.id;
      if (!isAuthor && perm !== "EDITOR") {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }
      await prisma.comment.delete({ where: { id: params.commentId } });
      return { success: true };
    },
    { params: t.Object({ commentId: t.String() }), requireRole: true },
  );
