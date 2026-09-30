/**
 * Serveur MCP Openforms : formulaires, questions, réponses, statistiques,
 * versions, commentaires et partage.
 *
 * Servi en HTTP par le backend (`/api/mcp`) et en stdio par `mcp-server/`, qui
 * importe ce fichier. Chaque outil appelle l'API REST avec la clé de
 * l'appelant, donc les droits sont exactement ceux de son compte.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { crossTab, filterRows, formStats, type Field, type Row } from "./stats.ts";

export type CallApi = <T = any>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<T>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface McpOptions {
  /** Origine publique du frontend, pour donner les liens des formulaires. */
  appUrl: string;
}

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

const READ = { readOnlyHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

// ───────────────────────── Questions ─────────────────────────

const FIELD_TYPES = [
  "short_text",
  "paragraph",
  "email",
  "number",
  "radio",
  "checkbox",
  "select",
  "date",
  "datetime",
  "file",
  "grid",
  "linear_scale",
  "checkbox_grid",
  "section",
  "text_block",
  "signature",
  "address",
  "stripe_payment",
  "rotation",
] as const;

const TYPE_HELP =
  "short_text (texte court), paragraph (texte long), email, number, radio (choix unique), " +
  "checkbox (choix multiples), select (liste déroulante), date, datetime, file, " +
  "linear_scale (échelle), grid (grille à choix unique par ligne), checkbox_grid, " +
  "section (saut de page / titre de section), text_block (texte sans réponse), signature, address, " +
  "rotation (répartition des participants entre des variantes).";

const optionSchema = z.object({
  label: z.string().max(200),
  value: z.string().max(200).optional().describe("Valeur stockée ; par défaut le libellé"),
  color: z.string().max(20).optional().describe("Couleur hex dans les statistiques"),
});

const questionProps = {
  label: z.string().max(300).describe("Intitulé de la question"),
  description: z.string().max(1000).optional(),
  placeholder: z.string().max(300).optional(),
  required: z.boolean().optional(),
  options: z.array(optionSchema).max(200).optional().describe("Choix (radio, checkbox, select, rotation)"),
  allowOther: z.boolean().optional().describe("Ajoute un choix « Autre » avec saisie libre"),
  requireJustification: z.boolean().optional().describe("Demande une justification après le choix"),
  allowAutoToday: z.boolean().optional(),
  condition: z
    .object({ fieldKey: z.string(), value: z.string() })
    .nullable()
    .optional()
    .describe("N'afficher la question que si la question `fieldKey` vaut `value` (null pour retirer)"),
  validation: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).optional(),
      pattern: z.string().max(500).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  accept: z.array(z.string()).max(50).optional().describe("Types MIME acceptés (file)"),
  maxSizeBytes: z.number().int().min(1).optional(),
  grid: z
    .object({ rows: z.array(z.string()).max(100), columns: z.array(z.string()).max(100) })
    .optional(),
  scale: z
    .object({
      min: z.number().int().min(0).max(1),
      max: z.number().int().min(2).max(10),
      minLabel: z.string().max(100).optional(),
      maxLabel: z.string().max(100).optional(),
    })
    .optional(),
};

const newQuestionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_]{1,64}$/)
    .optional()
    .describe("Identifiant de colonne ; déduit de l'intitulé si absent"),
  type: z.enum(FIELD_TYPES).describe(TYPE_HELP),
  ...questionProps,
});

type NewQuestion = z.infer<typeof newQuestionSchema>;

/** Même règle que l'éditeur (`toFieldKey`) : la clé nomme la colonne des exports. */
function toFieldKey(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/, "");
  return key === "" ? "champ" : key;
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 63 - String(suffix).length)}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 50)}_${Date.now().toString(36)}`;
}

/** Question au format du schéma : options complétées, valeurs nulles retirées. */
function toField(q: Record<string, unknown>): Record<string, unknown> {
  const field: Record<string, unknown> = { required: false };
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) field[k] = v;
  if (Array.isArray(field.options)) {
    field.options = (field.options as z.infer<typeof optionSchema>[]).map((o) => ({
      ...o,
      value: o.value ?? o.label,
    }));
  }
  return field;
}

function buildQuestions(questions: NewQuestion[], existing: Iterable<string>) {
  const taken = new Set(existing);
  return questions.map((q) => {
    const key = q.key ?? uniqueKey(toFieldKey(q.label), taken);
    if (q.key && taken.has(q.key)) throw new Error(`La clé « ${q.key} » est déjà utilisée dans ce formulaire.`);
    taken.add(key);
    return toField({ ...q, key });
  });
}

// ───────────────────────── Réglages ─────────────────────────

const settingsProps = {
  requireConsent: z.boolean().optional().describe("Consentement RGPD explicite avant soumission"),
  consentText: z.string().max(2000).optional(),
  privacyPolicyUrl: z.string().max(2000).optional(),
  isAnonymized: z.boolean().optional().describe("Aucune métadonnée d'identification (IP, navigateur) stockée"),
  encryptResponses: z.boolean().optional().describe("Chiffrement au repos des réponses"),
  visibility: z
    .enum(["PUBLIC", "RESTRICTED", "PRIVATE"])
    .optional()
    .describe("PUBLIC : tout le monde ; PRIVATE : comptes connectés ; RESTRICTED : emails autorisés"),
  allowedEmails: z.array(z.string()).optional().describe("Emails autorisés (visibilité RESTRICTED)"),
  notifyOwner: z.boolean().optional().describe("Email au propriétaire à chaque réponse"),
  sendConfirmationEmail: z.boolean().optional(),
  confirmationEmailText: z.string().max(5000).optional(),
  webhookUrl: z.string().max(1000).optional(),
  startsAt: z.string().nullable().optional().describe("Date ISO d'ouverture, ou null"),
  endsAt: z.string().nullable().optional().describe("Date ISO de fermeture, ou null"),
  maxResponses: z.number().int().nullable().optional().describe("Quota de réponses, ou null"),
  embedEnabled: z.boolean().optional(),
  embedOrigins: z.array(z.string()).max(50).optional().describe("Sites autorisés à intégrer (https://exemple.org)"),
};

const filterProps = {
  dateStart: z.string().optional().describe("Réponses envoyées à partir de cette date (ISO)"),
  dateEnd: z.string().optional().describe("Réponses envoyées jusqu'à cette date (ISO, journée incluse)"),
  filters: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe("Ne garder que les répondants dont la question (clé) vaut l'une des valeurs"),
};

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

export function createMcpServer(callApi: CallApi, { appUrl }: McpOptions): McpServer {
  const server = new McpServer({ name: "openforms", version: "0.2.0" });
  const base = appUrl.replace(/\/$/, "");
  const links = (form: { id: string; slug: string }) => ({
    publicUrl: `${base}/f/${form.slug}`,
    editUrl: `${base}/admin/forms/${form.id}`,
  });

  /** Formulaire tel que l'éditeur le voit (modifications en cours comprises). */
  const loadForm = async (formId: string) =>
    (await callApi<{ form: Record<string, any>; permission: string }>("GET", `/api/v1/forms/${formId}`));

  const loadRows = async (formId: string) =>
    callApi<{ form: { title: string; schema: Field[] }; rows: Row[]; permission: string }>(
      "GET",
      `/api/v1/responses/form/${formId}`,
    );

  const applyOps = (formId: string, ops: unknown[]) => callApi("POST", `/api/v1/forms/${formId}/ops`, { ops });

  const findField = (schema: Field[], key: string) => {
    const field = schema.find((f) => f.key === key);
    if (!field) throw new Error(`Aucune question de clé « ${key} » dans ce formulaire.`);
    return field;
  };

  // ───────────────────────── Organisations ─────────────────────────

  server.registerTool(
    "list_organizations",
    {
      title: "Lister les organisations",
      description: "Organisations dont le titulaire de la clé est membre, avec son rôle.",
      inputSchema: {},
      annotations: READ,
    },
    () => toResult(() => callApi("GET", "/api/v1/organizations")),
  );

  server.registerTool(
    "list_organization_members",
    {
      title: "Membres d'une organisation",
      description: "Membres d'une organisation et leur rôle (OWNER, ADMIN, MEMBER).",
      inputSchema: { organizationId: z.string() },
      annotations: READ,
    },
    ({ organizationId }) => toResult(() => callApi("GET", `/api/v1/organizations/${organizationId}/members`)),
  );

  server.registerTool(
    "create_organization",
    {
      title: "Créer une organisation",
      description: "Crée une organisation dont le titulaire de la clé devient propriétaire.",
      inputSchema: { name: z.string().min(2).max(100) },
      annotations: WRITE,
    },
    (args) => toResult(() => callApi("POST", "/api/v1/organizations", args)),
  );

  server.registerTool(
    "invite_organization_member",
    {
      title: "Inviter dans une organisation",
      description:
        "Ajoute une personne à une organisation par email (un compte est créé et une invitation envoyée si besoin). " +
        "Tout membre d'une organisation peut éditer tous ses formulaires.",
      inputSchema: {
        organizationId: z.string(),
        email: z.string().email(),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
      },
      annotations: WRITE,
    },
    ({ organizationId, ...body }) =>
      toResult(() => callApi("POST", `/api/v1/organizations/${organizationId}/members`, body)),
  );

  // ───────────────────────── Formulaires ─────────────────────────

  server.registerTool(
    "list_forms",
    {
      title: "Lister les formulaires",
      description:
        "Formulaires accessibles (possédés, partagés, ou via une organisation), du plus récemment modifié au plus ancien.",
      inputSchema: {
        search: z.string().optional().describe("Filtre sur le titre"),
        organizationId: z.string().optional(),
      },
      annotations: READ,
    },
    ({ search, organizationId }) =>
      toResult(async () => {
        const { forms } = await callApi<{ forms: any[] }>("GET", "/api/v1/forms");
        const needle = search?.toLowerCase();
        return forms
          .filter((f) => !needle || String(f.title).toLowerCase().includes(needle))
          .filter((f) => !organizationId || f.organizationId === organizationId)
          .map((f) => ({
            id: f.id,
            title: f.title,
            slug: f.slug,
            isPublished: f.isPublished,
            visibility: f.visibility,
            organizationId: f.organizationId,
            questions: Array.isArray(f.schema) ? f.schema.length : 0,
            responses: f._count?.responses ?? 0,
            updatedAt: f.updatedAt,
            ...links(f),
          }));
      }),
  );

  server.registerTool(
    "get_form",
    {
      title: "Détail d'un formulaire",
      description:
        "Questions (clé, type, intitulé, choix, conditions), réglages, partages et liens d'un formulaire.",
      inputSchema: { formId: z.string() },
      annotations: READ,
    },
    ({ formId }) =>
      toResult(async () => {
        const { form, permission } = await loadForm(formId);
        const { exportTheme: _theme, schema, ...rest } = form;
        return { ...rest, questions: schema, permission, ...links(form as any) };
      }),
  );

  server.registerTool(
    "create_form",
    {
      title: "Créer un formulaire",
      description:
        "Crée un formulaire (brouillon non publié), avec ou sans questions. Hors super administrateur, " +
        "`organizationId` est obligatoire : la création se fait au sein d'une organisation.",
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        organizationId: z.string().optional(),
        questions: z.array(newQuestionSchema).max(300).default([]),
        ...settingsProps,
      },
      annotations: WRITE,
    },
    ({ questions, ...rest }) =>
      toResult(async () => {
        const schema = buildQuestions(questions, []);
        const { form } = await callApi<{ form: any }>("POST", "/api/v1/forms", { ...rest, schema });
        return { id: form.id, title: form.title, slug: form.slug, questions: form.schema, ...links(form) };
      }),
  );

  server.registerTool(
    "update_form_settings",
    {
      title: "Modifier un formulaire (titre, réglages)",
      description:
        "Met à jour le titre, la description, le lien personnalisé et les réglages (RGPD, visibilité, " +
        "notifications, planification, quota, intégration). Les questions ne sont pas touchées : " +
        "utiliser add_questions, update_question, etc.",
      inputSchema: {
        formId: z.string(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(2000).optional(),
        slug: z.string().min(3).max(80).optional().describe("Lien personnalisé : /f/<slug>"),
        ...settingsProps,
      },
      annotations: WRITE,
    },
    ({ formId, title, description, ...settings }) =>
      toResult(async () => {
        // Titre et description passent par les opérations, comme dans l'éditeur :
        // un PUT qui les porte fermerait la session d'édition des collaborateurs.
        if (title !== undefined || description !== undefined) {
          await applyOps(formId, [{ t: "meta", title, description }]);
        }
        const changes = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined));
        if (Object.keys(changes).length > 0) {
          // L'API remet à zéro une date d'ouverture ou de fermeture absente du corps.
          const { form } = await loadForm(formId);
          const payload = { startsAt: form.startsAt, endsAt: form.endsAt, ...changes };
          await callApi("PUT", `/api/v1/forms/${formId}`, payload);
        }
        const { form } = await loadForm(formId);
        const { schema: _s, exportTheme: _t, access: _a, ...rest } = form;
        return { ...rest, ...links(form as any) };
      }),
  );

  server.registerTool(
    "set_form_published",
    {
      title: "Publier ou dépublier un formulaire",
      description: "Ouvre (true) ou ferme (false) la collecte de réponses.",
      inputSchema: { formId: z.string(), published: z.boolean() },
      annotations: WRITE,
    },
    ({ formId, published }) =>
      toResult(async () => {
        const res = await callApi<{ isPublished: boolean; slug: string }>(
          "POST",
          `/api/v1/forms/${formId}/publish`,
          { published },
        );
        return { ...res, ...links({ id: formId, slug: res.slug }) };
      }),
  );

  server.registerTool(
    "duplicate_form",
    {
      title: "Dupliquer un formulaire",
      description: "Copie les questions et réglages dans un nouveau brouillon, sans les réponses.",
      inputSchema: { formId: z.string() },
      annotations: WRITE,
    },
    ({ formId }) =>
      toResult(async () => {
        const { form } = await callApi<{ form: any }>("POST", `/api/v1/forms/${formId}/duplicate`);
        return { id: form.id, title: form.title, slug: form.slug, ...links(form) };
      }),
  );

  server.registerTool(
    "delete_form",
    {
      title: "Supprimer un formulaire",
      description: "Supprime définitivement un formulaire ET toutes ses réponses. Irréversible.",
      inputSchema: { formId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ formId }) => toResult(() => callApi("DELETE", `/api/v1/forms/${formId}`)),
  );

  server.registerTool(
    "move_form_to_organization",
    {
      title: "Rattacher un formulaire à une organisation",
      description:
        "Rattache le formulaire à une organisation (tous ses membres pourront l'éditer), ou le rend à son propriétaire avec null.",
      inputSchema: { formId: z.string(), organizationId: z.string().nullable() },
      annotations: WRITE,
    },
    ({ formId, organizationId }) =>
      toResult(() => callApi("PUT", `/api/v1/forms/${formId}/organization`, { organizationId })),
  );

  server.registerTool(
    "share_form",
    {
      title: "Partager un formulaire",
      description:
        "Donne accès à un formulaire par email : VIEWER (lecture), COMMENTER (commentaires), EDITOR (édition). " +
        "Un compte est créé et une invitation envoyée si la personne n'en a pas.",
      inputSchema: {
        formId: z.string(),
        email: z.string().email(),
        role: z.enum(["VIEWER", "COMMENTER", "EDITOR"]),
      },
      annotations: WRITE,
    },
    ({ formId, ...body }) => toResult(() => callApi("PUT", `/api/v1/forms/${formId}/access`, body)),
  );

  server.registerTool(
    "unshare_form",
    {
      title: "Retirer un partage",
      description: "Retire l'accès d'une personne (userId, visible dans get_form → access).",
      inputSchema: { formId: z.string(), userId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ formId, userId }) => toResult(() => callApi("DELETE", `/api/v1/forms/${formId}/access`, { userId })),
  );

  server.registerTool(
    "list_form_versions",
    {
      title: "Historique des versions",
      description: "Versions enregistrées d'un formulaire (une à chaque modification de réglages ou restauration).",
      inputSchema: { formId: z.string() },
      annotations: READ,
    },
    ({ formId }) => toResult(() => callApi("GET", `/api/v1/forms/${formId}/versions`)),
  );

  server.registerTool(
    "restore_form_version",
    {
      title: "Restaurer une version",
      description: "Remet un formulaire dans l'état d'une version. L'état actuel est d'abord sauvegardé.",
      inputSchema: { formId: z.string(), versionId: z.string() },
      annotations: WRITE,
    },
    ({ formId, versionId }) =>
      toResult(() => callApi("POST", `/api/v1/forms/${formId}/versions/${versionId}/restore`)),
  );

  // ───────────────────────── Questions ─────────────────────────

  server.registerTool(
    "add_questions",
    {
      title: "Ajouter des questions",
      description:
        "Ajoute une ou plusieurs questions, dans l'ordre donné, en fin de formulaire ou après la question `after`. " +
        "Les modifications apparaissent en direct chez les personnes qui éditent le formulaire.",
      inputSchema: {
        formId: z.string(),
        questions: z.array(newQuestionSchema).min(1).max(300),
        after: z
          .string()
          .nullable()
          .optional()
          .describe("Clé de la question après laquelle insérer ; null pour le début ; absent pour la fin"),
      },
      annotations: WRITE,
    },
    ({ formId, questions, after }) =>
      toResult(async () => {
        const { form } = await loadForm(formId);
        const fields = buildQuestions(questions, (form.schema as Field[]).map((f) => f.key));
        let previous = after;
        const ops = fields.map((field) => {
          const op = { t: "upsert", field, after: previous };
          // Chaque question se place derrière la précédente du lot.
          if (previous !== undefined) previous = field.key as string;
          return op;
        });
        await applyOps(formId, ops);
        return { added: fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) };
      }),
  );

  server.registerTool(
    "update_question",
    {
      title: "Modifier une question",
      description:
        "Modifie une question existante : seules les propriétés fournies changent. Les choix (`options`), " +
        "s'ils sont fournis, remplacent la liste entière. La clé ne peut pas changer (elle nomme la colonne des réponses).",
      inputSchema: {
        formId: z.string(),
        key: z.string().describe("Clé de la question à modifier"),
        type: z.enum(FIELD_TYPES).optional(),
        ...questionProps,
        label: questionProps.label.optional(),
      },
      annotations: WRITE,
    },
    ({ formId, key, ...changes }) =>
      toResult(async () => {
        const { form } = await loadForm(formId);
        const current = findField(form.schema as Field[], key) as unknown as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...current };
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined) continue;
          if (v === null) delete merged[k];
          else merged[k] = v;
        }
        const field = toField(merged);
        await applyOps(formId, [{ t: "upsert", field }]);
        return { updated: field };
      }),
  );

  server.registerTool(
    "delete_question",
    {
      title: "Supprimer une question",
      description:
        "Retire une question du formulaire. Les réponses déjà reçues gardent leur valeur mais la colonne n'est plus affichée.",
      inputSchema: { formId: z.string(), key: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ formId, key }) =>
      toResult(async () => {
        const { form } = await loadForm(formId);
        findField(form.schema as Field[], key);
        await applyOps(formId, [{ t: "remove", key }]);
        return { removed: key };
      }),
  );

  server.registerTool(
    "move_question",
    {
      title: "Déplacer une question",
      description: "Place une question juste après la question `after`, ou en tête avec null.",
      inputSchema: { formId: z.string(), key: z.string(), after: z.string().nullable() },
      annotations: WRITE,
    },
    ({ formId, key, after }) =>
      toResult(async () => {
        await applyOps(formId, [{ t: "move", key, after }]);
        const { form } = await loadForm(formId);
        return { order: (form.schema as Field[]).map((f) => f.key) };
      }),
  );

  // ───────────────────────── Réponses ─────────────────────────

  server.registerTool(
    "list_responses",
    {
      title: "Lister les réponses",
      description:
        "Réponses d'un formulaire, les plus récentes d'abord, avec pagination et filtres. " +
        "Les valeurs sont indexées par clé de question ; `questions` donne l'intitulé de chaque clé.",
      inputSchema: {
        formId: z.string(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
        fields: z.array(z.string()).optional().describe("Ne renvoyer que ces questions"),
        ...filterProps,
      },
      annotations: READ,
    },
    ({ formId, limit, offset, fields, ...filter }) =>
      toResult(async () => {
        const { form, rows } = await loadRows(formId);
        const kept = filterRows(rows, filter);
        const pick = (values: Record<string, unknown>) =>
          fields?.length
            ? Object.fromEntries(Object.entries(values).filter(([k]) => fields.some((f) => k === f || k.startsWith(`${f}__`))))
            : values;
        return {
          form: form.title,
          total: kept.length,
          offset,
          returned: Math.min(limit, Math.max(0, kept.length - offset)),
          questions: Object.fromEntries(
            form.schema
              .filter((f) => f.type !== "section" && f.type !== "text_block")
              .filter((f) => !fields?.length || fields.includes(f.key))
              .map((f) => [f.key, f.label]),
          ),
          rows: kept.slice(offset, offset + limit).map((r) => ({
            id: r.id,
            submittedAt: r.submittedAt,
            values: pick(r.values),
            ...(r.metadata && Object.keys(r.metadata).length ? { metadata: r.metadata } : {}),
          })),
        };
      }),
  );

  server.registerTool(
    "get_response",
    {
      title: "Détail d'une réponse",
      description: "Une réponse, question par question, avec l'intitulé de chaque question.",
      inputSchema: { formId: z.string(), responseId: z.string() },
      annotations: READ,
    },
    ({ formId, responseId }) =>
      toResult(async () => {
        const { form, rows } = await loadRows(formId);
        const row = rows.find((r) => r.id === responseId);
        if (!row) throw new Error("Réponse introuvable dans ce formulaire.");
        return {
          id: row.id,
          submittedAt: row.submittedAt,
          answers: form.schema
            .filter((f) => f.type !== "section" && f.type !== "text_block")
            .map((f) => ({ key: f.key, question: f.label, value: row.values[f.key] ?? null })),
          metadata: row.metadata ?? {},
        };
      }),
  );

  server.registerTool(
    "submit_response",
    {
      title: "Soumettre une réponse",
      description:
        "Envoie une réponse comme un participant : le formulaire doit être publié et ouvert, les réponses sont validées " +
        "(obligatoires, formats, choix autorisés), puis webhooks et emails partent comme d'habitude. " +
        "Choix : la `value` de l'option ; checkbox : liste de valeurs ; échelle : nombre.",
      inputSchema: {
        formId: z.string(),
        data: z.record(z.string(), z.any()).describe("Valeurs par clé de question"),
        consent: z.boolean().optional().describe("Consentement RGPD, requis si le formulaire l'exige"),
      },
      annotations: WRITE,
    },
    (args) => toResult(() => callApi("POST", "/api/v1/responses/submit", args)),
  );

  server.registerTool(
    "add_response",
    {
      title: "Ajouter une réponse (saisie manuelle)",
      description:
        "Ajoute une ligne au tableur des réponses, comme la saisie manuelle de l'interface : pas de validation, " +
        "ni publication requise, ni webhook ou email. Pour une réponse de participant, préférer submit_response.",
      inputSchema: {
        formId: z.string(),
        values: z.record(z.string(), z.any()).describe("Valeurs par clé de question"),
        metadata: z.record(z.string(), z.any()).optional().describe("Colonnes de métadonnées du tableur"),
      },
      annotations: WRITE,
    },
    ({ formId, values, metadata }) =>
      toResult(async () => {
        const { row } = await callApi<{ row: Row }>("POST", `/api/v1/responses/form/${formId}`);
        for (const [key, value] of Object.entries(values))
          await callApi("PATCH", `/api/v1/responses/${row.id}/cell`, { target: "field", key, value });
        for (const [key, value] of Object.entries(metadata ?? {}))
          await callApi("PATCH", `/api/v1/responses/${row.id}/cell`, { target: "meta", key, value });
        return { responseId: row.id };
      }),
  );

  server.registerTool(
    "update_response",
    {
      title: "Modifier une réponse",
      description:
        "Corrige des valeurs d'une réponse existante (seules les clés fournies changent), ou ses métadonnées de tableur.",
      inputSchema: {
        responseId: z.string(),
        values: z.record(z.string(), z.any()).default({}).describe("Valeurs par clé de question"),
        metadata: z.record(z.string(), z.any()).optional(),
      },
      annotations: WRITE,
    },
    ({ responseId, values, metadata }) =>
      toResult(async () => {
        for (const [key, value] of Object.entries(values))
          await callApi("PATCH", `/api/v1/responses/${responseId}/cell`, { target: "field", key, value });
        for (const [key, value] of Object.entries(metadata ?? {}))
          await callApi("PATCH", `/api/v1/responses/${responseId}/cell`, { target: "meta", key, value });
        return { responseId, updated: [...Object.keys(values), ...Object.keys(metadata ?? {})] };
      }),
  );

  server.registerTool(
    "delete_response",
    {
      title: "Supprimer une réponse",
      description: "Supprime définitivement une réponse et ses fichiers.",
      inputSchema: { responseId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ responseId }) => toResult(() => callApi("DELETE", `/api/v1/responses/${responseId}`)),
  );

  // ───────────────────────── Statistiques ─────────────────────────

  server.registerTool(
    "get_form_stats",
    {
      title: "Statistiques d'un formulaire",
      description:
        "Total, activité des 30 derniers jours et résultats question par question : répartition des choix " +
        "(effectifs et %), moyenne/médiane des nombres et échelles, grilles, exemples de réponses libres. " +
        "Filtrable par période et par réponse à d'autres questions.",
      inputSchema: {
        formId: z.string(),
        questions: z.array(z.string()).optional().describe("Clés des questions à analyser (toutes par défaut)"),
        sampleSize: z.number().int().min(0).max(200).default(20).describe("Réponses libres citées par question"),
        ...filterProps,
      },
      annotations: READ,
    },
    ({ formId, questions, sampleSize, ...filter }) =>
      toResult(async () => {
        const [{ summary }, { form, rows }] = await Promise.all([
          callApi<{ summary: Record<string, unknown> }>("GET", `/api/v1/stats/form/${formId}/summary`),
          loadRows(formId),
        ]);
        const kept = filterRows(rows, filter);
        return {
          ...summary,
          filteredResponses: kept.length,
          questions: formStats(form.schema, kept, questions, sampleSize),
        };
      }),
  );

  server.registerTool(
    "cross_tabulate",
    {
      title: "Tableau croisé",
      description:
        "Croise deux questions (ex. satisfaction × tranche d'âge). mode : count (effectifs), row (% en ligne), " +
        "col (% en colonne), total (% du total). Les choix multiples comptent chaque case cochée.",
      inputSchema: {
        formId: z.string(),
        rowQuestion: z.string().describe("Clé de la question en lignes"),
        columnQuestion: z.string().describe("Clé de la question en colonnes"),
        mode: z.enum(["count", "row", "col", "total"]).default("count"),
        ...filterProps,
      },
      annotations: READ,
    },
    ({ formId, rowQuestion, columnQuestion, mode, ...filter }) =>
      toResult(async () => {
        const { form, rows } = await loadRows(formId);
        return crossTab(
          findField(form.schema, rowQuestion),
          findField(form.schema, columnQuestion),
          filterRows(rows, filter),
          mode,
        );
      }),
  );

  server.registerTool(
    "get_global_stats",
    {
      title: "Statistiques globales de la plateforme",
      description:
        "KPIs consolidés (formulaires, réponses, utilisateurs, top formulaires). Réservé aux super administrateurs.",
      inputSchema: {},
      annotations: READ,
    },
    () => toResult(() => callApi("GET", "/api/v1/stats")),
  );

  server.registerTool(
    "list_stats_presets",
    {
      title: "Lister les presets de croisement",
      description: "Croisements enregistrés depuis la page Statistiques, éventuellement filtrés sur un formulaire.",
      inputSchema: { formId: z.string().optional() },
      annotations: READ,
    },
    ({ formId }) =>
      toResult(() =>
        callApi("GET", `/api/v1/stats-presets${formId ? `?formId=${encodeURIComponent(formId)}` : ""}`),
      ),
  );

  server.registerTool(
    "create_stats_preset",
    {
      title: "Créer un preset de croisement",
      description:
        "Enregistre un croisement réutilisable dans la page Statistiques. " +
        "Plusieurs formIds signifient une comparaison entre formulaires (les réponses ne sont pas appariées).",
      inputSchema: {
        name: z.string().min(1).max(120),
        formIds: z.array(z.string()).min(1),
        config: presetConfigSchema,
      },
      annotations: WRITE,
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
      annotations: WRITE,
    },
    ({ presetId, ...changes }) => toResult(() => callApi("PUT", `/api/v1/stats-presets/${presetId}`, changes)),
  );

  server.registerTool(
    "delete_stats_preset",
    {
      title: "Supprimer un preset de croisement",
      description: "Supprime définitivement un preset enregistré.",
      inputSchema: { presetId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ presetId }) => toResult(() => callApi("DELETE", `/api/v1/stats-presets/${presetId}`)),
  );

  // ───────────────────────── Commentaires ─────────────────────────

  server.registerTool(
    "list_comments",
    {
      title: "Commentaires d'un formulaire",
      description: "Fil de commentaires des collaborateurs sur un formulaire.",
      inputSchema: { formId: z.string() },
      annotations: READ,
    },
    ({ formId }) => toResult(() => callApi("GET", `/api/v1/forms/${formId}/comments`)),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Commenter un formulaire",
      description: "Ajoute un commentaire visible des collaborateurs du formulaire.",
      inputSchema: { formId: z.string(), body: z.string().min(1).max(4000) },
      annotations: WRITE,
    },
    ({ formId, body }) => toResult(() => callApi("POST", `/api/v1/forms/${formId}/comments`, { body })),
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Résoudre un commentaire",
      description: "Marque un commentaire comme résolu (ou le rouvre avec false).",
      inputSchema: { commentId: z.string(), resolved: z.boolean().default(true) },
      annotations: WRITE,
    },
    ({ commentId, resolved }) =>
      toResult(() => callApi("PATCH", `/api/v1/comments/${commentId}/resolve`, { resolved })),
  );

  server.registerTool(
    "delete_comment",
    {
      title: "Supprimer un commentaire",
      description: "Supprime un commentaire.",
      inputSchema: { commentId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ commentId }) => toResult(() => callApi("DELETE", `/api/v1/comments/${commentId}`)),
  );

  return server;
}
