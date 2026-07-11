import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";
import { createPasswordSetupToken } from "../lib/passwordSetup.ts";
import { sendInviteEmail } from "../services/mailer.ts";
import { env } from "../config/env.ts";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${base || "org"}-${Math.random().toString(36).slice(2, 6)}`;
}

export const organizationController = new Elysia({ prefix: "/api/v1/organizations" })
  .use(authPlugin)

  // --- Lister les organisations de l'utilisateur connecté ---
  .get(
    "/",
    async ({ auth }) => {
      const memberships = await prisma.organizationMember.findMany({
        where: { userId: auth!.user.id },
        include: {
          organization: true,
        },
        orderBy: { createdAt: "desc" },
      });
      const organizations = memberships.map((m) => m.organization);
      return { success: true, organizations };
    },
    { requireRole: true },
  )

  // --- Obtenir les détails d'une organisation ---
  .get(
    "/:id",
    async ({ auth, params, set }) => {
      const member = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: auth!.user.id } },
        include: { organization: true },
      });

      // Si l'utilisateur est SUPER_ADMIN, il a tous les droits d'accès même s'il n'est pas membre
      if (!member && auth!.user.role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, error: "Accès refusé : vous n'êtes pas membre de cette organisation." };
      }

      const org = member?.organization || await prisma.organization.findUnique({ where: { id: params.id } });
      if (!org) {
        set.status = 404;
        return { success: false, error: "Organisation introuvable." };
      }

      return {
        success: true,
        organization: org,
        role: member?.role || "SUPER_ADMIN",
      };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Créer une organisation ---
  .post(
    "/",
    async ({ auth, body }) => {
      const name = body.name.trim();
      const slug = slugify(name);

      const organization = await prisma.organization.create({
        data: {
          name,
          slug,
          members: {
            create: {
              userId: auth!.user.id,
              role: "OWNER",
            },
          },
        },
      });

      return { success: true, organization };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 100 }),
      }),
      requireRole: true,
    },
  )

  // --- Lister les membres d'une organisation ---
  .get(
    "/:id/members",
    async ({ auth, params, set }) => {
      const member = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: auth!.user.id } },
      });

      if (!member && auth!.user.role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      const members = await prisma.organizationMember.findMany({
        where: { organizationId: params.id },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return { success: true, members };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Ajouter un membre dans l'organisation ---
  .post(
    "/:id/members",
    async ({ auth, params, body, set }) => {
      const caller = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: auth!.user.id } },
      });

      const isAuthorized = auth!.user.role === "SUPER_ADMIN" || (caller && (caller.role === "OWNER" || caller.role === "ADMIN"));
      if (!isAuthorized) {
        set.status = 403;
        return { success: false, error: "Privilèges insuffisants pour inviter un membre." };
      }

      const email = body.email.trim().toLowerCase();
      let targetUser = await prisma.user.findUnique({ where: { email } });

      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: {
            email,
            passwordHash: null,
            role: "EDITOR",
            displayName: email.split("@")[0],
          },
        });

        const { token } = await createPasswordSetupToken(targetUser.id);
        const inviteLink = `${env.appUrl}/admin/set-password?token=${token}`;
        await sendInviteEmail(email, inviteLink).catch((err) => console.error("Invite email failed:", err));
      }

      const alreadyMember = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: targetUser.id } },
      });
      if (alreadyMember) {
        set.status = 409;
        return { success: false, error: "Cet utilisateur est déjà membre de l'organisation." };
      }

      const member = await prisma.organizationMember.create({
        data: {
          organizationId: params.id,
          userId: targetUser.id,
          role: body.role,
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });

      return { success: true, member };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        email: t.String({ format: "email" }),
        role: t.Union([t.Literal("ADMIN"), t.Literal("MEMBER")]),
      }),
      requireRole: true,
    },
  )

  // --- Supprimer un membre de l'organisation ---
  .delete(
    "/:id/members/:memberId",
    async ({ auth, params, set }) => {
      const caller = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: auth!.user.id } },
      });

      const targetMember = await prisma.organizationMember.findUnique({
        where: { id: params.memberId },
      });
      if (!targetMember) {
        set.status = 404;
        return { success: false, error: "Membre introuvable." };
      }

      // Règles :
      // 1. Un SUPER_ADMIN peut tout faire.
      // 2. Un membre peut se retirer lui-même.
      // 3. Un OWNER ou ADMIN peut retirer d'autres membres (mais un ADMIN ne peut pas retirer un OWNER).
      const isSelf = targetMember.userId === auth!.user.id;
      let canRemove = auth!.user.role === "SUPER_ADMIN" || isSelf;

      if (!canRemove && caller) {
        if (caller.role === "OWNER") {
          canRemove = true;
        } else if (caller.role === "ADMIN" && targetMember.role !== "OWNER") {
          canRemove = true;
        }
      }

      if (!canRemove) {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }

      // Si c'est le seul OWNER, l'empêcher de partir sans transférer
      if (targetMember.role === "OWNER") {
        const ownerCount = await prisma.organizationMember.count({
          where: { organizationId: params.id, role: "OWNER" },
        });
        if (ownerCount <= 1) {
          set.status = 400;
          return { success: false, error: "Vous devez désigner un autre propriétaire avant de quitter l'organisation." };
        }
      }

      await prisma.organizationMember.delete({ where: { id: params.id } });
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), memberId: t.String() }),
      requireRole: true,
    },
  )

  // --- Supprimer l'organisation ---
  .delete(
    "/:id",
    async ({ auth, params, set }) => {
      const caller = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: auth!.user.id } },
      });

      const isAuthorized = auth!.user.role === "SUPER_ADMIN" || (caller && caller.role === "OWNER");
      if (!isAuthorized) {
        set.status = 403;
        return { success: false, error: "Action non autorisée : seul le propriétaire peut supprimer l'organisation." };
      }

      await prisma.organization.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
