import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin, resolveFormPermission } from "../middleware/auth.ts";
import { makeRateLimit } from "../middleware/security.ts";
import { validateSubmission, type FieldDefinition } from "../lib/formSchema.ts";
import { sealContent, openContent, hashIp, verifyDescriptor } from "../services/crypto.ts";

function clientIp(request: Request): string | undefined {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]?.trim() : undefined;
}

/** Descripteur de fichier signé, renvoyé par /uploads puis rejoué à la soumission. */
const FileRef = t.Object({
  file: t.Object({
    formId: t.String(),
    fieldKey: t.String(),
    storedName: t.String(),
    originalName: t.String(),
    mimeType: t.String(),
    sizeBytes: t.Integer(),
    checksum: t.String(),
  }),
  signature: t.String(),
});

export const responseController = new Elysia({ prefix: "/api/v1/responses" })
  .use(authPlugin)

  // =========================================================================
  //  SOUMISSION PUBLIQUE  (rate-limité, validé, chiffré, RGPD)
  // =========================================================================
  .use(
    makeRateLimit({
      max: 15,
      duration: 60_000,
      message: "Trop de soumissions. Veuillez patienter avant de renvoyer le formulaire.",
    }),
  )
  .post(
    "/submit",
    async ({ body, set, request, auth }) => {
      const form = await prisma.form.findUnique({ where: { id: body.formId } });
      if (!form || !form.isPublished) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable ou non publié." };
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
          return { success: false, error: "Vous n'êtes pas autorisé à soumettre des réponses à ce formulaire." };
        }
      }

      // 1. Consentement explicite obligatoire (RGPD).
      if (form.requireConsent && body.consent !== true) {
        set.status = 400;
        return { success: false, error: "Le consentement est requis pour soumettre." };
      }

      // 2. Validation dynamique des réponses contre la définition du formulaire.
      const fields = form.schema as unknown as FieldDefinition[];
      const { errors, clean } = validateSubmission(fields, body.data ?? {});
      if (errors.length > 0) {
        set.status = 422;
        return { success: false, error: "Réponses invalides.", details: errors };
      }

      // 3. Vérification des fichiers (descripteurs signés, non falsifiables).
      const filesToCreate: {
        fieldKey: string;
        originalName: string;
        storedName: string;
        mimeType: string;
        sizeBytes: number;
        checksum: string;
      }[] = [];

      const fileGroups = (body.files ?? {}) as Record<
        string,
        { file: (typeof filesToCreate)[number] & { formId: string }; signature: string }[]
      >;
      for (const [fieldKey, refs] of Object.entries(fileGroups)) {
        const field = fields.find((f) => f.key === fieldKey && f.type === "file");
        if (!field) continue;
        for (const ref of refs) {
          if (
            ref.file.formId !== form.id ||
            ref.file.fieldKey !== fieldKey ||
            !verifyDescriptor(ref.file, ref.signature)
          ) {
            set.status = 400;
            return { success: false, error: "Référence de fichier invalide." };
          }
          filesToCreate.push({
            fieldKey,
            originalName: ref.file.originalName,
            storedName: ref.file.storedName,
            mimeType: ref.file.mimeType,
            sizeBytes: ref.file.sizeBytes,
            checksum: ref.file.checksum,
          });
        }
        // Trace des fichiers dans le contenu (métadonnées non sensibles).
        clean[fieldKey] = refs.map((r) => ({
          originalName: r.file.originalName,
          mimeType: r.file.mimeType,
          sizeBytes: r.file.sizeBytes,
        }));
      }

      // 4. Anonymisation / chiffrement au repos.
      const ipHash = form.isAnonymized ? null : hashIp(clientIp(request) ?? "0.0.0.0");
      const content = sealContent(clean, form.encryptResponses);

      const response = await prisma.response.create({
        data: {
          formId: form.id,
          content: content as object,
          ipHash,
          userAgent: form.isAnonymized ? null : (request.headers.get("user-agent")?.slice(0, 300) ?? null),
          files: filesToCreate.length ? { create: filesToCreate } : undefined,
        },
      });

      set.status = 201;
      return { success: true, message: "Réponse enregistrée avec succès.", responseId: response.id };
    },
    {
      body: t.Object({
        formId: t.String({ format: "uuid" }),
        data: t.Record(t.String(), t.Any()),
        consent: t.Optional(t.Boolean()),
        files: t.Optional(t.Record(t.String(), t.Array(FileRef, { maxItems: 20 }))),
      }),
    },
  )

  // =========================================================================
  //  LECTURE ADMIN  (alimente le tableur)
  // =========================================================================
  .get(
    "/form/:formId",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.formId } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }

      const responses = await prisma.response.findMany({
        where: { formId: form.id },
        orderBy: { submittedAt: "desc" },
        include: {
          files: { select: { id: true, fieldKey: true, originalName: true, mimeType: true, sizeBytes: true } },
        },
      });

      const rows = responses.map((r) => ({
        id: r.id,
        submittedAt: r.submittedAt,
        updatedAt: r.updatedAt,
        values: openContent(r.content) as Record<string, unknown>,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        files: r.files,
      }));

      return {
        success: true,
        permission: perm,
        form: {
          id: form.id,
          title: form.title,
          schema: form.schema,
          metaColumns: form.metaColumns,
        },
        rows,
      };
    },
    { params: t.Object({ formId: t.String() }), requireRole: true },
  )

  // =========================================================================
  //  AJOUT D'UNE LIGNE VIERGE  (saisie manuelle depuis le tableur)
  // =========================================================================
  .post(
    "/form/:formId",
    async ({ auth, params, set }) => {
      const form = await prisma.form.findUnique({ where: { id: params.formId } });
      if (!form) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }
      const perm = await resolveFormPermission(prisma.formAccess, auth!.user, form.id, form.ownerId);
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Ajout non autorisé." };
      }
      const content = sealContent({}, form.encryptResponses);
      const response = await prisma.response.create({
        data: { formId: form.id, content: content as object, ipHash: null },
        include: { files: true },
      });
      set.status = 201;
      return {
        success: true,
        row: {
          id: response.id,
          submittedAt: response.submittedAt,
          updatedAt: response.updatedAt,
          values: {},
          metadata: {},
          files: [],
        },
      };
    },
    { params: t.Object({ formId: t.String() }), requireRole: true },
  )

  // =========================================================================
  //  ÉDITION D'UNE CELLULE  (autosave depuis le tableur)
  // =========================================================================
  .patch(
    "/:id/cell",
    async ({ auth, params, body, set }) => {
      const response = await prisma.response.findUnique({
        where: { id: params.id },
        include: { form: { select: { id: true, ownerId: true, encryptResponses: true } } },
      });
      if (!response) {
        set.status = 404;
        return { success: false, error: "Réponse introuvable." };
      }
      const perm = await resolveFormPermission(
        prisma.formAccess,
        auth!.user,
        response.form.id,
        response.form.ownerId,
      );
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Édition non autorisée (lecture seule)." };
      }

      if (body.target === "meta") {
        const metadata = { ...((response.metadata as Record<string, unknown>) ?? {}) };
        metadata[body.key] = body.value;
        await prisma.response.update({
          where: { id: params.id },
          data: { metadata: metadata as object },
        });
      } else {
        const values = { ...(openContent(response.content) as Record<string, unknown>) };
        values[body.key] = body.value;
        const content = sealContent(values, response.form.encryptResponses);
        await prisma.response.update({ where: { id: params.id }, data: { content: content as object } });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        target: t.Union([t.Literal("field"), t.Literal("meta")]),
        key: t.String({ maxLength: 64 }),
        value: t.Any(),
      }),
      requireRole: true,
    },
  )

  // =========================================================================
  //  SUPPRESSION D'UNE RÉPONSE
  // =========================================================================
  .delete(
    "/:id",
    async ({ auth, params, set }) => {
      const response = await prisma.response.findUnique({
        where: { id: params.id },
        include: { form: { select: { id: true, ownerId: true } } },
      });
      if (!response) {
        set.status = 404;
        return { success: false, error: "Réponse introuvable." };
      }
      const perm = await resolveFormPermission(
        prisma.formAccess,
        auth!.user,
        response.form.id,
        response.form.ownerId,
      );
      if (perm !== "WRITE") {
        set.status = 403;
        return { success: false, error: "Suppression non autorisée." };
      }
      await prisma.response.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );
