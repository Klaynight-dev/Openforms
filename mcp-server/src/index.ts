#!/usr/bin/env bun
/**
 * Serveur MCP Openforms (transport stdio).
 *
 * Expose les informations (formulaires, statistiques, presets de croisement)
 * et les actions de configuration à un client MCP local- Claude Desktop,
 * Claude Code, etc. Voir README.md pour le branchement.
 *
 * Contrainte stdio : stdout transporte le protocole MCP. Toute trace doit
 * partir sur stderr, jamais sur stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callApi, apiUrl, ApiError } from "./api.ts";

const server = new McpServer({ name: "openforms", version: "0.1.0" });

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Une erreur d'API est renvoyée au modèle comme résultat, pas comme exception. */
function toResult(fn: () => Promise<unknown>): Promise<ToolResult> {
  return fn()
    .then(ok)
    .catch((e: unknown) => ({
      content: [
        {
          type: "text" as const,
          text:
            e instanceof ApiError
              ? `Erreur ${e.status} : ${e.message}`
              : e instanceof Error
                ? e.message
                : "Erreur inconnue.",
        },
      ],
      isError: true,
    }));
}

// ───────────────────────── Lecture ─────────────────────────

server.registerTool(
  "list_organizations",
  {
    title: "Lister les organisations",
    description: "Organisations dont le titulaire de la clé d'API est membre.",
    inputSchema: {},
  },
  () => toResult(() => callApi("GET", "/api/v1/organizations")),
);

server.registerTool(
  "list_forms",
  {
    title: "Lister les formulaires",
    description:
      "Formulaires accessibles au titulaire de la clé (possédés, partagés, ou via son organisation).",
    inputSchema: {},
  },
  () => toResult(() => callApi("GET", "/api/v1/forms")),
);

server.registerTool(
  "get_form",
  {
    title: "Détail d'un formulaire",
    description:
      "Structure (champs), réglages RGPD, planification et visibilité d'un formulaire. Ne renvoie aucune réponse.",
    inputSchema: { formId: z.string().describe("Identifiant du formulaire") },
  },
  ({ formId }) => toResult(() => callApi("GET", `/api/v1/forms/${formId}`)),
);

server.registerTool(
  "get_form_stats",
  {
    title: "Statistiques d'un formulaire",
    description:
      "Nombre total de réponses et activité des 30 derniers jours pour un formulaire donné.",
    inputSchema: { formId: z.string().describe("Identifiant du formulaire") },
  },
  ({ formId }) => toResult(() => callApi("GET", `/api/v1/stats/form/${formId}/summary`)),
);

server.registerTool(
  "get_global_stats",
  {
    title: "Statistiques globales de la plateforme",
    description:
      "KPIs consolidés (formulaires, réponses, utilisateurs, top formulaires). Réservé aux super administrateurs : renvoie une erreur 403 sinon.",
    inputSchema: {},
  },
  () => toResult(() => callApi("GET", "/api/v1/stats")),
);

server.registerTool(
  "list_stats_presets",
  {
    title: "Lister les presets de croisement",
    description:
      "Configurations de croisement enregistrées par le titulaire de la clé, éventuellement filtrées sur un formulaire.",
    inputSchema: {
      formId: z.string().optional().describe("Ne garder que les presets portant sur ce formulaire"),
    },
  },
  ({ formId }) =>
    toResult(() =>
      callApi(
        "GET",
        `/api/v1/stats-presets${formId ? `?formId=${encodeURIComponent(formId)}` : ""}`,
      ),
    ),
);

// ───────────────────────── Configuration ─────────────────────────

/** Réglages modifiables à distance- la structure des champs en est exclue. */
const FORM_SETTING_KEYS = [
  "title",
  "description",
  "requireConsent",
  "consentText",
  "isAnonymized",
  "encryptResponses",
  "visibility",
  "notifyOwner",
  "sendConfirmationEmail",
  "confirmationEmailText",
  "webhookUrl",
  "startsAt",
  "endsAt",
  "maxResponses",
] as const;

server.registerTool(
  "update_form_settings",
  {
    title: "Modifier les réglages d'un formulaire",
    description:
      "Met à jour les réglages d'un formulaire (titre, description, RGPD, notifications, planification). " +
      "La structure des champs n'est jamais touchée : elle est relue puis réémise telle quelle.",
    inputSchema: {
      formId: z.string().describe("Identifiant du formulaire"),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(2000).optional(),
      requireConsent: z.boolean().optional().describe("Consentement explicite avant soumission"),
      consentText: z.string().max(2000).optional(),
      isAnonymized: z.boolean().optional().describe("Aucune métadonnée d'identification stockée"),
      encryptResponses: z.boolean().optional().describe("Chiffrement au repos des réponses"),
      visibility: z.enum(["PUBLIC", "RESTRICTED", "PRIVATE"]).optional(),
      notifyOwner: z.boolean().optional(),
      sendConfirmationEmail: z.boolean().optional(),
      confirmationEmailText: z.string().max(5000).optional(),
      webhookUrl: z.string().max(1000).optional(),
      startsAt: z.string().nullable().optional().describe("Date ISO d'ouverture, ou null"),
      endsAt: z.string().nullable().optional().describe("Date ISO de fermeture, ou null"),
      maxResponses: z.number().int().nullable().optional(),
    },
  },
  ({ formId, ...changes }) =>
    toResult(async () => {
      // L'API attend le payload complet (titre + schéma) : on relit d'abord le
      // formulaire pour ne réécrire que les réglages demandés.
      const current = await callApi<{ form: Record<string, unknown> }>(
        "GET",
        `/api/v1/forms/${formId}`,
      );
      const form = current.form;

      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description ?? undefined,
        schema: form.schema,
        metaColumns: form.metaColumns,
      };
      for (const key of FORM_SETTING_KEYS) {
        if (form[key] !== undefined && form[key] !== null) payload[key] = form[key];
      }
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined) payload[key] = value;
      }

      return callApi("PUT", `/api/v1/forms/${formId}`, payload);
    }),
);

server.registerTool(
  "set_form_published",
  {
    title: "Publier ou dépublier un formulaire",
    description: "Ouvre ou ferme la collecte de réponses d'un formulaire.",
    inputSchema: {
      formId: z.string().describe("Identifiant du formulaire"),
      published: z.boolean().describe("true pour publier, false pour dépublier"),
    },
  },
  ({ formId, published }) =>
    toResult(() => callApi("POST", `/api/v1/forms/${formId}/publish`, { published })),
);

const presetConfigSchema = z.object({
  rowFields: z.array(z.string()).describe("Clés des champs portés par l'axe des lignes"),
  colFields: z.array(z.string()).describe("Clés des champs portés par l'axe des colonnes"),
  crossMode: z.enum(["count", "row", "col", "total"]),
  extraFilters: z.record(z.string(), z.array(z.string())).default({}),
  numericFilters: z
    .record(z.string(), z.object({ min: z.number().optional(), max: z.number().optional() }))
    .default({}),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
});

server.registerTool(
  "create_stats_preset",
  {
    title: "Créer un preset de croisement",
    description:
      "Enregistre une configuration de croisement réutilisable depuis la page Statistiques. " +
      "Plusieurs formIds signifient une comparaison entre formulaires (les réponses ne sont pas appariées).",
    inputSchema: {
      name: z.string().min(1).max(120),
      formIds: z.array(z.string()).min(1),
      config: presetConfigSchema,
    },
  },
  (args) => toResult(() => callApi("POST", "/api/v1/stats-presets", args)),
);

server.registerTool(
  "update_stats_preset",
  {
    title: "Modifier un preset de croisement",
    description: "Renomme un preset et/ou remplace sa configuration.",
    inputSchema: {
      presetId: z.string(),
      name: z.string().min(1).max(120).optional(),
      formIds: z.array(z.string()).min(1).optional(),
      config: presetConfigSchema.optional(),
    },
  },
  ({ presetId, ...changes }) =>
    toResult(() => callApi("PUT", `/api/v1/stats-presets/${presetId}`, changes)),
);

server.registerTool(
  "delete_stats_preset",
  {
    title: "Supprimer un preset de croisement",
    description: "Supprime définitivement un preset enregistré.",
    inputSchema: { presetId: z.string() },
  },
  ({ presetId }) => toResult(() => callApi("DELETE", `/api/v1/stats-presets/${presetId}`)),
);

server.registerTool(
  "grant_form_access",
  {
    title: "Donner accès à un formulaire",
    description:
      "Attribue un droit de lecture ou d'écriture sur un formulaire à un utilisateur. Réservé aux super administrateurs.",
    inputSchema: {
      userId: z.string(),
      formId: z.string(),
      permission: z.enum(["READ", "WRITE"]),
    },
  },
  (args) => toResult(() => callApi("PUT", "/api/v1/access", args)),
);

server.registerTool(
  "revoke_form_access",
  {
    title: "Révoquer l'accès à un formulaire",
    description:
      "Retire l'accès d'un utilisateur à un formulaire. Réservé aux super administrateurs.",
    inputSchema: { userId: z.string(), formId: z.string() },
  },
  (args) => toResult(() => callApi("DELETE", "/api/v1/access", args)),
);

// ───────────────────────── Démarrage ─────────────────────────

if (!process.env.OPENFORMS_API_KEY) {
  console.error(
    "[openforms-mcp] OPENFORMS_API_KEY absente : les outils répondront par une erreur " +
      "tant qu'une clé n'est pas fournie.",
  );
}
console.error(`[openforms-mcp] API cible : ${apiUrl}`);

await server.connect(new StdioServerTransport());
