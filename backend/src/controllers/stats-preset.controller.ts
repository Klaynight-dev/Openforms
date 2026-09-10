import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";

/**
 * Presets de croisement de la page Statistiques.
 * Chaque preset appartient à son créateur : aucun partage implicite, un
 * SUPER_ADMIN peut néanmoins intervenir sur ceux des autres (support).
 */

/** Forme du croisement enregistré- voir la page Statistiques côté frontend. */
const PresetConfig = t.Object({
  rowFields: t.Array(t.String()),
  colFields: t.Array(t.String()),
  crossMode: t.Union([t.Literal("count"), t.Literal("row"), t.Literal("col"), t.Literal("total")]),
  extraFilters: t.Record(t.String(), t.Array(t.String())),
  numericFilters: t.Record(
    t.String(),
    t.Object({ min: t.Optional(t.Number()), max: t.Optional(t.Number()) }),
  ),
  dateStart: t.Optional(t.String()),
  dateEnd: t.Optional(t.String()),
});

function serialize(preset: {
  id: string;
  name: string;
  formIds: unknown;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: preset.id,
    name: preset.name,
    formIds: Array.isArray(preset.formIds) ? (preset.formIds as string[]) : [],
    config: preset.config,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

export const statsPresetController = new Elysia({ prefix: "/api/v1/stats-presets" })
  .use(authPlugin)

  // --- Liste des presets de l'utilisateur courant ---
  .get(
    "/",
    async ({ auth, query }) => {
      const presets = await prisma.statsPreset.findMany({
        where: { userId: auth!.user.id },
        orderBy: { updatedAt: "desc" },
      });
      const all = presets.map(serialize);
      // `formIds` est un Json : le filtre par formulaire se fait en mémoire.
      const filtered = query.formId ? all.filter((p) => p.formIds.includes(query.formId!)) : all;
      return { success: true, presets: filtered };
    },
    {
      query: t.Object({ formId: t.Optional(t.String()) }),
      requireRole: true,
    },
  )

  // --- Création ---
  .post(
    "/",
    async ({ auth, body }) => {
      const preset = await prisma.statsPreset.create({
        data: {
          userId: auth!.user.id,
          name: body.name.trim(),
          formIds: body.formIds,
          config: body.config,
        },
      });
      return { success: true, preset: serialize(preset) };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        formIds: t.Array(t.String(), { minItems: 1 }),
        config: PresetConfig,
      }),
      requireRole: true,
    },
  )

  // --- Mise à jour (renommage et/ou nouvelle configuration) ---
  .put(
    "/:id",
    async ({ auth, params, body, set }) => {
      const existing = await prisma.statsPreset.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Preset introuvable." };
      }
      if (existing.userId !== auth!.user.id && auth!.user.role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      const preset = await prisma.statsPreset.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.formIds !== undefined ? { formIds: body.formIds } : {}),
          ...(body.config !== undefined ? { config: body.config } : {}),
        },
      });
      return { success: true, preset: serialize(preset) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        formIds: t.Optional(t.Array(t.String(), { minItems: 1 })),
        config: t.Optional(PresetConfig),
      }),
      requireRole: true,
    },
  )

  // --- Suppression ---
  .delete(
    "/:id",
    async ({ auth, params, set }) => {
      const existing = await prisma.statsPreset.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return { success: false, error: "Preset introuvable." };
      }
      if (existing.userId !== auth!.user.id && auth!.user.role !== "SUPER_ADMIN") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      await prisma.statsPreset.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
