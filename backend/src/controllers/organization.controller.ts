import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";
import { createPasswordSetupToken } from "../lib/passwordSetup.ts";
import { sendInviteEmail } from "../services/mailer.ts";
import { env } from "../config/env.ts";
import type { SessionContext } from "../lib/session.ts";

/**
 * Organisations (cercle 2).
 *
 * Être membre d'une organisation donne l'accès en édition à tous ses
 * formulaires (voir resolveFormPermission). Les rôles ne départagent que
 * l'administration de l'organisation elle-même :
 *   - OWNER  : tout, y compris supprimer l'organisation et nommer d'autres propriétaires ;
 *   - ADMIN  : renommer, inviter, changer les rôles et retirer des membres (hors propriétaires) ;
 *   - MEMBER : travaille sur les formulaires, sans gérer l'équipe.
 */

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";
type CallerRole = OrgRole | "SUPER_ADMIN" | null;

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

/** Rôle de l'appelant dans l'organisation ; un SUPER_ADMIN a toujours la main. */
async function callerRole(organizationId: string, user: SessionContext["user"]): Promise<CallerRole> {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    select: { role: true },
  });
  if (member) return member.role as OrgRole;
  return user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : null;
}

const canManage = (role: CallerRole) => role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";
const isOwnerLike = (role: CallerRole) => role === "OWNER" || role === "SUPER_ADMIN";

const memberInclude = {
  user: { select: { id: true, email: true, displayName: true, passwordHash: true } },
} as const;

/** Masque le hash, n'expose que le fait qu'un mot de passe existe. */
function publicMember<M extends { user: { passwordHash: string | null } }>(member: M) {
  const { passwordHash, ...user } = member.user;
  return { ...member, user: { ...user, hasPassword: passwordHash !== null } };
}

export const organizationController = new Elysia({ prefix: "/api/v1/organizations" })
  .use(authPlugin)

  // --- Organisations visibles : les siennes, toutes pour un SUPER_ADMIN ---
  .get(
    "/",
    async ({ auth }) => {
      const user = auth!.user;
      const memberships = await prisma.organizationMember.findMany({
        where: { userId: user.id },
        select: { organizationId: true, role: true },
      });
      const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role as OrgRole]));

      const organizations = await prisma.organization.findMany({
        where: user.role === "SUPER_ADMIN" ? {} : { id: { in: [...roleByOrg.keys()] } },
        include: { _count: { select: { members: true, forms: true } } },
        orderBy: { name: "asc" },
      });

      return {
        success: true,
        organizations: organizations.map(({ _count, ...org }) => ({
          ...org,
          role: roleByOrg.get(org.id) ?? "SUPER_ADMIN",
          memberCount: _count.members,
          formCount: _count.forms,
        })),
      };
    },
    { requireRole: true },
  )

  // --- Détail d'une organisation ---
  .get(
    "/:id",
    async ({ auth, params, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!role) {
        set.status = 403;
        return { success: false, error: "Vous n'êtes pas membre de cette organisation." };
      }
      const organization = await prisma.organization.findUnique({ where: { id: params.id } });
      if (!organization) {
        set.status = 404;
        return { success: false, error: "Organisation introuvable." };
      }
      return { success: true, organization, role };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Créer une organisation ---
  .post(
    "/",
    async ({ auth, body }) => {
      const name = body.name.trim();
      const organization = await prisma.organization.create({
        data: {
          name,
          slug: slugify(name),
          members: { create: { userId: auth!.user.id, role: "OWNER" } },
        },
      });
      return { success: true, organization: { ...organization, role: "OWNER", memberCount: 1, formCount: 0 } };
    },
    {
      body: t.Object({ name: t.String({ minLength: 2, maxLength: 100 }) }),
      requireRole: true,
    },
  )

  // --- Renommer ---
  .patch(
    "/:id",
    async ({ auth, params, body, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!canManage(role)) {
        set.status = 403;
        return { success: false, error: "Seuls les propriétaires et administrateurs peuvent renommer l'organisation." };
      }
      const organization = await prisma.organization.update({
        where: { id: params.id },
        data: { name: body.name.trim() },
      });
      return { success: true, organization };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String({ minLength: 2, maxLength: 100 }) }),
      requireRole: true,
    },
  )

  // --- Membres ---
  .get(
    "/:id/members",
    async ({ auth, params, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!role) {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }
      const members = await prisma.organizationMember.findMany({
        where: { organizationId: params.id },
        include: memberInclude,
        orderBy: { createdAt: "asc" },
      });
      return { success: true, members: members.map(publicMember) };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  )

  // --- Ajouter un membre (compte créé et invité s'il n'existe pas) ---
  .post(
    "/:id/members",
    async ({ auth, params, body, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!canManage(role)) {
        set.status = 403;
        return { success: false, error: "Seuls les propriétaires et administrateurs peuvent ajouter des membres." };
      }
      if (body.role === "OWNER" && !isOwnerLike(role)) {
        set.status = 403;
        return { success: false, error: "Seul un propriétaire peut nommer un autre propriétaire." };
      }
      const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!organization) {
        set.status = 404;
        return { success: false, error: "Organisation introuvable." };
      }

      const email = body.email.trim().toLowerCase();
      let targetUser = await prisma.user.findUnique({ where: { email } });
      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: { email, passwordHash: null, role: "EDITOR", displayName: null },
        });
      }

      const alreadyMember = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: params.id, userId: targetUser.id } },
      });
      if (alreadyMember) {
        set.status = 409;
        return { success: false, error: "Cette personne fait déjà partie de l'organisation." };
      }

      const member = await prisma.organizationMember.create({
        data: { organizationId: params.id, userId: targetUser.id, role: body.role },
        include: memberInclude,
      });

      // Un compte sans mot de passe n'a aucun moyen de se connecter : on lui
      // (ré)envoie un lien, et on le renvoie aussi à l'appelant, qui peut le
      // transmettre lui-même si l'email n'est pas configuré.
      let inviteLink: string | null = null;
      if (targetUser.passwordHash === null) {
        const { token } = await createPasswordSetupToken(targetUser.id);
        inviteLink = `${env.appUrl}/admin/set-password?token=${token}`;
        await sendInviteEmail(email, inviteLink).catch((err) => console.error("Invite email failed:", err));
      }

      return { success: true, member: publicMember(member), inviteLink };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        email: t.String({ format: "email", maxLength: 320 }),
        role: t.Union([t.Literal("OWNER"), t.Literal("ADMIN"), t.Literal("MEMBER")]),
      }),
      requireRole: true,
    },
  )

  // --- Changer le rôle d'un membre ---
  .patch(
    "/:id/members/:memberId",
    async ({ auth, params, body, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!canManage(role)) {
        set.status = 403;
        return { success: false, error: "Seuls les propriétaires et administrateurs peuvent changer les rôles." };
      }
      const target = await prisma.organizationMember.findUnique({ where: { id: params.memberId } });
      if (!target || target.organizationId !== params.id) {
        set.status = 404;
        return { success: false, error: "Membre introuvable." };
      }
      if ((target.role === "OWNER" || body.role === "OWNER") && !isOwnerLike(role)) {
        set.status = 403;
        return { success: false, error: "Seul un propriétaire peut modifier le rôle de propriétaire." };
      }
      if (target.role === "OWNER" && body.role !== "OWNER") {
        const owners = await prisma.organizationMember.count({
          where: { organizationId: params.id, role: "OWNER" },
        });
        if (owners <= 1) {
          set.status = 400;
          return { success: false, error: "L'organisation doit garder au moins un propriétaire." };
        }
      }
      const member = await prisma.organizationMember.update({
        where: { id: target.id },
        data: { role: body.role },
        include: memberInclude,
      });
      return { success: true, member: publicMember(member) };
    },
    {
      params: t.Object({ id: t.String(), memberId: t.String() }),
      body: t.Object({ role: t.Union([t.Literal("OWNER"), t.Literal("ADMIN"), t.Literal("MEMBER")]) }),
      requireRole: true,
    },
  )

  // --- Renvoyer le lien d'invitation d'un membre qui n'a pas encore de mot de passe ---
  .post(
    "/:id/members/:memberId/invite",
    async ({ auth, params, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!canManage(role)) {
        set.status = 403;
        return { success: false, error: "Action réservée aux propriétaires et administrateurs." };
      }
      const target = await prisma.organizationMember.findUnique({
        where: { id: params.memberId },
        include: { user: true },
      });
      if (!target || target.organizationId !== params.id) {
        set.status = 404;
        return { success: false, error: "Membre introuvable." };
      }
      if (target.user.passwordHash !== null) {
        set.status = 400;
        return { success: false, error: "Ce compte est déjà activé." };
      }
      const { token } = await createPasswordSetupToken(target.userId);
      const inviteLink = `${env.appUrl}/admin/set-password?token=${token}`;
      await sendInviteEmail(target.user.email, inviteLink).catch((err) => console.error("Invite email failed:", err));
      return { success: true, inviteLink };
    },
    { params: t.Object({ id: t.String(), memberId: t.String() }), requireRole: true },
  )

  // --- Retirer un membre (ou quitter l'organisation) ---
  .delete(
    "/:id/members/:memberId",
    async ({ auth, params, set }) => {
      const role = await callerRole(params.id, auth!.user);
      const target = await prisma.organizationMember.findUnique({ where: { id: params.memberId } });
      if (!target || target.organizationId !== params.id) {
        set.status = 404;
        return { success: false, error: "Membre introuvable." };
      }

      const isSelf = target.userId === auth!.user.id;
      const allowed =
        isSelf ||
        isOwnerLike(role) ||
        (role === "ADMIN" && target.role !== "OWNER");
      if (!allowed) {
        set.status = 403;
        return { success: false, error: "Action non autorisée." };
      }

      if (target.role === "OWNER") {
        const owners = await prisma.organizationMember.count({
          where: { organizationId: params.id, role: "OWNER" },
        });
        if (owners <= 1) {
          set.status = 400;
          return { success: false, error: "Nommez un autre propriétaire avant de retirer le dernier." };
        }
      }

      await prisma.organizationMember.delete({ where: { id: target.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String(), memberId: t.String() }), requireRole: true },
  )

  // --- Supprimer l'organisation ---
  .delete(
    "/:id",
    async ({ auth, params, set }) => {
      const role = await callerRole(params.id, auth!.user);
      if (!isOwnerLike(role)) {
        set.status = 403;
        return { success: false, error: "Seul un propriétaire peut supprimer l'organisation." };
      }
      // La relation Form -> Organization supprime en cascade : on rend d'abord
      // chaque formulaire à son propriétaire pour ne perdre aucune réponse.
      const [detached] = await prisma.$transaction([
        prisma.form.updateMany({ where: { organizationId: params.id }, data: { organizationId: null } }),
        prisma.organization.delete({ where: { id: params.id } }),
      ]);
      return { success: true, detachedForms: detached.count };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
