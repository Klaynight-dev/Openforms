import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";
import { hashPassword } from "../services/crypto.ts";

export const usersController = new Elysia({ prefix: "/api/v1" })
  .use(authPlugin)

  // --- Liste des utilisateurs ---
  .get(
    "/users",
    async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, role: true, displayName: true, isActive: true, createdAt: true },
      });
      return { success: true, users };
    },
    { requireRole: ["SUPER_ADMIN"] },
  )

  // --- Création d'un compte (éditeur ou super-admin) ---
  .post(
    "/users",
    async ({ body, set }) => {
      const email = body.email.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        set.status = 409;
        return { success: false, error: "Un compte existe déjà avec cet email." };
      }
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(body.password),
          role: body.role,
          displayName: body.displayName,
        },
        select: { id: true, email: true, role: true, displayName: true, isActive: true },
      });

      // Ajout automatique à l'organisation par défaut "Humanitours"
      const defaultOrg = await prisma.organization.findUnique({ where: { slug: "humanitours" } });
      if (defaultOrg) {
        await prisma.organizationMember.create({
          data: {
            organizationId: defaultOrg.id,
            userId: user.id,
            role: "MEMBER",
          },
        });
      }

      return { success: true, user };
    },
    {
      body: t.Object({
        email: t.String({ format: "email", maxLength: 320 }),
        password: t.String({ minLength: 10, maxLength: 200 }),
        role: t.Union([t.Literal("SUPER_ADMIN"), t.Literal("EDITOR")]),
        displayName: t.Optional(t.String({ maxLength: 120 })),
      }),
      requireRole: ["SUPER_ADMIN"],
    },
  )

  // --- Mise à jour d'un compte ---
  .patch(
    "/users/:id",
    async ({ params, body }) => {
      const user = await prisma.user.update({
        where: { id: params.id },
        data: {
          role: body.role,
          displayName: body.displayName,
          isActive: body.isActive,
          ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
        },
        select: { id: true, email: true, role: true, displayName: true, isActive: true },
      });
      return { success: true, user };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        role: t.Optional(t.Union([t.Literal("SUPER_ADMIN"), t.Literal("EDITOR")])),
        displayName: t.Optional(t.String({ maxLength: 120 })),
        isActive: t.Optional(t.Boolean()),
        password: t.Optional(t.String({ minLength: 10, maxLength: 200 })),
      }),
      requireRole: ["SUPER_ADMIN"],
    },
  )

  // --- Suppression d'un compte (pas soi-même) ---
  .delete(
    "/users/:id",
    async ({ params, auth, set }) => {
      if (params.id === auth!.user.id) {
        set.status = 400;
        return { success: false, error: "Impossible de supprimer votre propre compte." };
      }
      const target = await prisma.user.findUnique({ where: { id: params.id } });
      if (!target) {
        set.status = 404;
        return { success: false, error: "Utilisateur introuvable." };
      }
      // Les formulaires possédés sont réassignés à l'admin qui effectue la
      // suppression (préserve les réponses). Sessions et accès sont supprimés
      // en cascade automatiquement.
      const reassigned = await prisma.form.updateMany({
        where: { ownerId: params.id },
        data: { ownerId: auth!.user.id },
      });
      await prisma.user.delete({ where: { id: params.id } });
      return { success: true, reassignedForms: reassigned.count };
    },
    { params: t.Object({ id: t.String() }), requireRole: ["SUPER_ADMIN"] },
  )

  // --- Attribution d'un accès formulaire à un éditeur ---
  .put(
    "/access",
    async ({ body }) => {
      const access = await prisma.formAccess.upsert({
        where: { userId_formId: { userId: body.userId, formId: body.formId } },
        create: { userId: body.userId, formId: body.formId, permission: body.permission },
        update: { permission: body.permission },
      });
      return { success: true, access };
    },
    {
      body: t.Object({
        userId: t.String(),
        formId: t.String(),
        permission: t.Union([t.Literal("READ"), t.Literal("WRITE")]),
      }),
      requireRole: ["SUPER_ADMIN"],
    },
  )

  // --- Révocation d'un accès ---
  .delete(
    "/access",
    async ({ body }) => {
      await prisma.formAccess.deleteMany({ where: { userId: body.userId, formId: body.formId } });
      return { success: true };
    },
    {
      body: t.Object({ userId: t.String(), formId: t.String() }),
      requireRole: ["SUPER_ADMIN"],
    },
  );
