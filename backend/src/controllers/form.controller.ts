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

/** Mots réservés par le routage front (/f/:slug) ou pouvant prêter à confusion. */
const RESERVED_SLUGS = new Set(["admin", "api", "f", "public", "new", "login", "register", "docs"]);

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Valide et normalise un slug personnalisé, ou lève une erreur lisible côté client. */
async function ensureCustomSlug(
  rawSlug: string,
  currentFormId: string | null,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const slug = rawSlug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 80) {
    return {
      ok: false,
      error:
        "Le lien personnalisé doit contenir entre 3 et 80 caractères : minuscules, chiffres et tirets uniquement (pas au début/à la fin, pas de tirets consécutifs).",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Ce lien personnalisé est réservé et ne peut pas être utilisé." };
  }
  const existing = await prisma.form.findUnique({ where: { slug } });
  if (existing && existing.id !== currentFormId) {
    return { ok: false, error: "Ce lien personnalisé est déjà utilisé par un autre formulaire." };
  }
  return { ok: true, slug };
}

const FormSettings = {
  title: t.String({ minLength: 1, maxLength: 300 }),
  slug: t.Optional(t.String({ minLength: 3, maxLength: 80 })),
  description: t.Optional(t.String({ maxLength: 2000 })),
  schema: FormSchemaArray,
  metaColumns: t.Optional(t.Array(MetaColumnSchema, { maxItems: 100 })),
  requireConsent: t.Optional(t.Boolean()),
  consentText: t.Optional(t.String({ maxLength: 2000 })),
  isAnonymized: t.Optional(t.Boolean()),
  encryptResponses: t.Optional(t.Boolean()),
  organizationId: t.Optional(t.String()),
  visibility: t.Optional(t.String()),
  allowedEmails: t.Optional(t.Array(t.String())),
  notifyOwner: t.Optional(t.Boolean()),
  sendConfirmationEmail: t.Optional(t.Boolean()),
  confirmationEmailText: t.Optional(t.String({ maxLength: 5000 })),
  webhookUrl: t.Optional(t.String({ maxLength: 1000 })),
  startsAt: t.Optional(t.Union([t.String(), t.Null()])),
  endsAt: t.Optional(t.Union([t.String(), t.Null()])),
  maxResponses: t.Optional(t.Union([t.Integer(), t.Null()])),
  translations: t.Optional(t.Any()),
};

export const formController = new Elysia({ prefix: "/api/v1/forms" })
  .use(authPlugin)

  // --- Définition publique d'un formulaire publié (remplissage, sans auth) ---
  .get(
    "/public/:slug",
    async ({ params, set, auth }) => {
      const form = await prisma.form.findUnique({ where: { slug: params.slug } });
      if (!form || !form.isPublished) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }

      if (form.visibility === "PRIVATE") {
        if (!auth) {
          set.status = 401;
          return { success: false, error: "Ce formulaire est réservé aux membres connectés." };
        }
      } else if (form.visibility === "RESTRICTED") {
        if (!auth) {
          set.status = 401;
          return { success: false, error: "Ce formulaire est restreint. Veuillez vous connecter." };
        }
        const userEmail = auth.user.email;
        const hasAccess = form.allowedEmails.some(
          (email) => email.toLowerCase() === userEmail.toLowerCase()
        );
        if (!hasAccess) {
          set.status = 403;
          return { success: false, error: "Vous n'êtes pas autorisé à accéder à ce formulaire." };
        }
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
          visibility: form.visibility,
        },
      };
    },
    { params: t.Object({ slug: t.String() }) },
  )

  // --- Liste des formulaires accessibles à l'utilisateur courant ---
  .get(
    "/",
    async ({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      let where = {};
      if (auth.user.role !== "SUPER_ADMIN") {
        const userOrgs = await prisma.organizationMember.findMany({
          where: { userId: auth.user.id },
          select: { organizationId: true },
        });
        const orgIds = userOrgs.map((o) => o.organizationId);

        where = {
          OR: [
            { ownerId: auth.user.id },
            { organizationId: { in: orgIds } },
            { access: { some: { userId: auth.user.id } } },
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
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      if (body.organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: body.organizationId, userId: auth.user.id } },
        });
        if (!member) {
          set.status = 403;
          return { success: false, error: "Vous n'êtes pas membre de cette organisation." };
        }
      } else {
        if (auth.user.role !== "SUPER_ADMIN") {
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
          visibility: body.visibility ?? "PUBLIC",
          allowedEmails: body.allowedEmails ?? [],
          notifyOwner: body.notifyOwner ?? false,
          sendConfirmationEmail: body.sendConfirmationEmail ?? false,
          confirmationEmailText: body.confirmationEmailText ?? null,
          webhookUrl: body.webhookUrl ?? null,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          maxResponses: body.maxResponses ?? null,
          translations: body.translations ?? {},
          ownerId: auth.user.id,
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
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      const form = await prisma.form.findUnique({
        where: { id: params.id },
        include: { access: { include: { user: { select: { id: true, email: true, displayName: true } } } } },
      });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth.user, form.id, form.ownerId);
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
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth.user, form.id, form.ownerId);
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Édition non autorisée." };
      }

      let nextSlug = form.slug;
      if (body.slug !== undefined && body.slug.trim().toLowerCase() !== form.slug) {
        const result = await ensureCustomSlug(body.slug, form.id);
        if (!result.ok) {
          set.status = 409;
          return { success: false, error: result.error };
        }
        nextSlug = result.slug;
      }

      const updated = await prisma.form.update({
        where: { id: params.id },
        data: {
          slug: nextSlug,
          title: body.title,
          description: body.description,
          schema: body.schema,
          metaColumns: body.metaColumns ?? undefined,
          requireConsent: body.requireConsent,
          consentText: body.consentText,
          isAnonymized: body.isAnonymized,
          encryptResponses: body.encryptResponses,
          visibility: body.visibility,
          allowedEmails: body.allowedEmails,
          notifyOwner: body.notifyOwner,
          sendConfirmationEmail: body.sendConfirmationEmail,
          confirmationEmailText: body.confirmationEmailText,
          webhookUrl: body.webhookUrl,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          maxResponses: body.maxResponses,
          translations: body.translations,
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
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth.user, form.id, form.ownerId);
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

  // --- Duplication (accès lecture minimum sur l'original + droits de création sur la cible) ---
  .post(
    "/:id/duplicate",
    async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth.user, form.id, form.ownerId);
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      // Check if user is allowed to duplicate into the target organization
      const organizationId = form.organizationId;
      if (organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId, userId: auth.user.id } },
        });
        if (!member && auth.user.role !== "SUPER_ADMIN") {
          set.status = 403;
          return { success: false, error: "Vous n'êtes pas membre de cette organisation." };
        }
      } else {
        if (auth.user.role !== "SUPER_ADMIN") {
          set.status = 403;
          return { success: false, error: "Création réservée aux administrateurs ou au sein d'une organisation." };
        }
      }

      const baseTitle = `${form.title} (copie)`;
      const newForm = await prisma.form.create({
        data: {
          slug: slugify(baseTitle),
          title: baseTitle,
          description: form.description,
          schema: form.schema ?? [],
          metaColumns: form.metaColumns ?? [],
          requireConsent: form.requireConsent,
          consentText: form.consentText,
          isAnonymized: form.isAnonymized,
          encryptResponses: form.encryptResponses,
          visibility: form.visibility,
          allowedEmails: form.allowedEmails,
          notifyOwner: form.notifyOwner,
          sendConfirmationEmail: form.sendConfirmationEmail,
          confirmationEmailText: form.confirmationEmailText,
          webhookUrl: form.webhookUrl,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          maxResponses: form.maxResponses,
          translations: form.translations ?? {},
          isPublished: false, // reset to draft
          ownerId: auth.user.id,
          organizationId: form.organizationId,
        },
      });

      return { success: true, form: newForm };
    },
    { params: t.Object({ id: t.String() }), requireRole: true }
  )

  // --- Suppression (Super Admin, propriétaire, ou admin d'organisation) ---
  .delete(
    "/:id",
    async ({ params, auth, set }) => {
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
      const form = await prisma.form.findUnique({ where: { id: params.id } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }

      let canDelete = auth.user.role === "SUPER_ADMIN" || form.ownerId === auth.user.id;

      if (!canDelete && form.organizationId) {
        const member = await prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: form.organizationId, userId: auth.user.id } },
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
