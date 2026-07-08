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
      const where =
        auth!.user.role === "SUPER_ADMIN"
          ? {}
          : {
              OR: [
                { ownerId: auth!.user.id },
                { access: { some: { userId: auth!.user.id } } },
              ],
            };
      const forms = await prisma.form.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { responses: true } } },
      });
      return { success: true, forms };
    },
    { requireRole: true },
  )

  // --- Création (Super Admin uniquement) ---
  .post(
    "/",
    async ({ auth, body }) => {
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
        },
      });
      return { success: true, form };
    },
    { body: t.Object(FormSettings), requireRole: ["SUPER_ADMIN"] },
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

  // --- Suppression (Super Admin uniquement) ---
  .delete(
    "/:id",
    async ({ params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      await prisma.form.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: ["SUPER_ADMIN"] },
  );
