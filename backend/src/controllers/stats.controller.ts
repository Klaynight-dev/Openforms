import { Elysia } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";

/**
 * Statistiques globales de la plateforme.
 * GET /api/v1/stats — réservé aux SUPER_ADMIN.
 * GET /api/v1/stats/form/:formId — accessible aux utilisateurs ayant accès au formulaire.
 */
export const statsController = new Elysia({ prefix: "/api/v1/stats" })
  .use(authPlugin)

  // =========================================================================
  //  STATS GLOBALES  (SUPER_ADMIN uniquement)
  // =========================================================================
  .get(
    "/",
    async ({ auth, set }) => {
      if (!auth || auth.user.role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, error: "Accès réservé aux super administrateurs." };
      }

      const now = new Date();

      // Bornes temporelles
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 29);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      // Requêtes parallèles
      const [
        totalForms,
        publishedForms,
        totalResponses,
        responsesToday,
        responsesWeek,
        responsesMonth,
        responsesPrevMonth,
        totalUsers,
        activeUsers,
        topForms,
        activityRaw,
      ] = await Promise.all([
        // Formulaires
        prisma.form.count(),
        prisma.form.count({ where: { isPublished: true } }),

        // Réponses globales
        prisma.response.count(),
        prisma.response.count({ where: { submittedAt: { gte: todayStart } } }),
        prisma.response.count({ where: { submittedAt: { gte: weekStart } } }),
        prisma.response.count({ where: { submittedAt: { gte: monthStart } } }),
        prisma.response.count({ where: { submittedAt: { gte: prevMonthStart, lt: prevMonthEnd } } }),

        // Utilisateurs
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),

        // Top 5 formulaires les plus actifs
        prisma.form.findMany({
          select: {
            id: true,
            title: true,
            slug: true,
            isPublished: true,
            _count: { select: { responses: true } },
          },
          orderBy: { responses: { _count: "desc" } },
          take: 5,
        }),

        // Activité des 30 derniers jours (toutes les réponses avec leur date)
        prisma.response.findMany({
          where: { submittedAt: { gte: thirtyDaysAgo } },
          select: { submittedAt: true },
          orderBy: { submittedAt: "asc" },
        }),
      ]);

      // Construction du tableau d'activité (1 entrée par jour sur 30 jours)
      const activityMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(thirtyDaysAgo);
        d.setDate(thirtyDaysAgo.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        activityMap.set(key, 0);
      }
      for (const r of activityRaw) {
        const key = r.submittedAt.toISOString().slice(0, 10);
        if (activityMap.has(key)) {
          activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
        }
      }
      const activity = Array.from(activityMap.entries()).map(([date, count]) => ({ date, count }));

      // Delta mois en cours vs mois précédent
      const monthDelta =
        responsesPrevMonth === 0
          ? null
          : Math.round(((responsesMonth - responsesPrevMonth) / responsesPrevMonth) * 100);

      return {
        success: true,
        stats: {
          forms: {
            total: totalForms,
            published: publishedForms,
            draft: totalForms - publishedForms,
          },
          responses: {
            total: totalResponses,
            today: responsesToday,
            week: responsesWeek,
            month: responsesMonth,
            monthDelta,
          },
          users: {
            total: totalUsers,
            active: activeUsers,
            inactive: totalUsers - activeUsers,
          },
          topForms: topForms.map((f) => ({
            id: f.id,
            title: f.title,
            slug: f.slug,
            isPublished: f.isPublished,
            responseCount: f._count.responses,
          })),
          activity,
        },
      };
    },
    { requireRole: ["SUPER_ADMIN"] as any },
  )

  // =========================================================================
  //  STATS PAR FORMULAIRE  (SUPER_ADMIN + EDITOR ayant accès)
  //  Calcul côté frontend à partir de listResponses — pas d'endpoint dédié.
  //  Cet endpoint existe pour les métadonnées de base uniquement.
  // =========================================================================
  .get(
    "/form/:formId/summary",
    async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }

      const form = await prisma.form.findUnique({
        where: { id: params.formId },
        select: { id: true, title: true, ownerId: true, isPublished: true, schema: true },
      });

      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }

      // Vérification des droits
      const perm = await resolveFormPermission(prisma.formAccess, auth.user, form.id, form.ownerId);
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 29);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const [totalResponses, activityRaw] = await Promise.all([
        prisma.response.count({ where: { formId: form.id } }),
        prisma.response.findMany({
          where: { formId: form.id, submittedAt: { gte: thirtyDaysAgo } },
          select: { submittedAt: true },
        }),
      ]);

      const activityMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(thirtyDaysAgo);
        d.setDate(thirtyDaysAgo.getDate() + i);
        activityMap.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of activityRaw) {
        const key = r.submittedAt.toISOString().slice(0, 10);
        if (activityMap.has(key)) {
          activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
        }
      }

      return {
        success: true,
        summary: {
          formId: form.id,
          title: form.title,
          isPublished: form.isPublished,
          totalResponses,
          activity: Array.from(activityMap.entries()).map(([date, count]) => ({ date, count })),
        },
      };
    },
    { requireRole: true },
  );
