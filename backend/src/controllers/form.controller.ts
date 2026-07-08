import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin, resolveFormPermission } from "../middleware/auth.ts";
import { FormSchemaArray, MetaColumnSchema } from "../lib/formSchema.ts";
import { randomToken } from "../services/crypto.ts";

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${base || "formulaire"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

const FormSettings = {
  title: t.String({ minLength: 1, maxLength: 300 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  schema: FormSchemaArray,
  metaColumns: t.Optional(t.Array(MetaColumnSchema, { maxItems: 100 })),
  requireConsent: t.Optional(t.Boolean()),
  consentText: t.Optional(t.String({ maxLength: 2000 })),
  isAnonymized: t.Optional(t.Boolean()),
  encryptResponses: t.Optional(t.Boolean()),
  organizationId: t.Optional(t.String()),
};

export const formController = new Elysia({ prefix: "/api/v1/forms" })
  .use(authPlugin)

  // --- Définition publique d'un formulaire publié (remplissage, sans auth) ---
  .get(
    "/public/:slug",
    async ({ params, set }) => {
      const form = await prisma.form.findUnique({ where: { slug: params.slug } });
      if (!form || !form.isPublished) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      return {
        success: true,
        form: {
          id: form.id,
          slug: form.slug,
          title: form.title,
          description: form.description,
          schema: form.schema,
          requireConsent: form.requireConsent,
          consentText: form.consentText,
          isAnonymized: form.isAnonymized,
        },
      };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  // --- Liste des formulaires accessibles à l'utilisateur courant ---
  .get(
    "/",
    async ({ auth }) => {
      let where = {};
      if (auth!.user.role !== "SUPER_ADMIN") {
        const userOrgs = await prisma.organizationMember.findMany({
          where: { userId: auth!.user.id },
          select: { organizationId: true },
        });
        const orgIds = userOrgs.map((o) => o.organizationId);

        where = {
          OR: [
            { ownerId: auth!.user.id },
            { organizationId: { in: orgIds } },
            { access: { some: { userId: auth!.user.id } } },
          ],
        };
      }
      const forms = await prisma.form.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { responses: true } } },
      });
      return { success: true, forms };
    },
    { requireRole: true },
  )

  // --- Création (Super Admin ou membre d'une organisation) ---
  .post(
    "/",
    async ({ auth, body, set }) => {
      if (body.organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: body.organizationId, userId: auth!.user.id } },
        });
        if (!member) {
          set.status = 403;
          return { success: false, error: "Vous n'êtes pas membre de cette organisation." };
        }
      } else {
        if (auth!.user.role !== "SUPER_ADMIN") {
          set.status = 403;
          return { success: false, error: "Création réservée aux administrateurs ou au sein d'une organisation." };
        }
      }

      const form = await prisma.form.create({
        data: {
          slug: slugify(body.title),
          title: body.title,
          description: body.description,
          schema: body.schema,
          metaColumns: body.metaColumns ?? [],
          requireConsent: body.requireConsent ?? true,
          consentText: body.consentText,
          isAnonymized: body.isAnonymized ?? false,
          encryptResponses: body.encryptResponses ?? false,
          ownerId: auth!.user.id,
          organizationId: body.organizationId ?? null,
        },
      });
      return { success: true, form };
    },
    { body: t.Object(FormSettings), requireRole: true },
  )

  // --- Détail (accès lecture minimum) ---
  .get(
    "/:id",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({
        where: { id: params.id },
        include: { access: { include: { user: { select: { id: true, email: true, displayName: true } } } } },
      });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }
      return { success: true, form, permission: perm };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Mise à jour de la structure / des réglages ---
  .put(
    "/:id",
    async ({ auth, params, body, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Édition non autorisée." };
      }
      const updated = await prisma.form.update({
        where: { id: params.id },
        data: {
          title: body.title,
          description: body.description,
          schema: body.schema,
          metaColumns: body.metaColumns ?? undefined,
          requireConsent: body.requireConsent,
          consentText: body.consentText,
          isAnonymized: body.isAnonymized,
          encryptResponses: body.encryptResponses,
        },
      });
      return { success: true, form: updated };
    },
    { params: t.Object({ id: t.String() }), body: t.Object(FormSettings), requireRole: true },
  )

  // --- Publication / dépublication (Super Admin ou propriétaire) ---
  .post(
    "/:id/publish",
    async ({ auth, params, body, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }
      const updated = await prisma.form.update({
        where: { id: params.id },
        data: { isPublished: body.published },
      });
      return { success: true, isPublished: updated.isPublished, slug: updated.slug };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ published: t.Boolean() }),
      requireRole: true,
    },
  )

  // --- Suppression (Super Admin, propriétaire, ou admin d'organisation) ---
  .delete(
    "/:id",
    async ({ params, auth, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }

      let canDelete = auth!.user.role === "SUPER_ADMIN" || form.ownerId === auth!.user.id;

      if (!canDelete && form.organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: form.organizationId, userId: auth!.user.id } },
        });
        if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }

      await prisma.form.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
