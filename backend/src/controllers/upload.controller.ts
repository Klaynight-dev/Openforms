import { Elysia, t } from "elysia";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { prisma } from "../services/prisma.ts";
import { env } from "../config/env.ts";
import { authPlugin, resolveFormPermission } from "../middleware/auth.ts";
import { makeRateLimit } from "../middleware/security.ts";
import { sha256, randomToken, signDescriptor } from "../services/crypto.ts";
import type { FieldDefinition } from "../lib/formSchema.ts";

const UPLOAD_ROOT = resolve(env.uploadDir);
await mkdir(UPLOAD_ROOT, { recursive: true });

/** Vérifie qu'un type MIME est autorisé par la liste `accept` d'un champ. */
function mimeAllowed(accept: string[] | undefined, mime: string): boolean {
  if (!accept || accept.length === 0) return true;
  return accept.some((a) => {
    if (a.endsWith("/*")) return mime.startsWith(a.slice(0, -1));
    return a === mime;
  });
}

export const uploadController = new Elysia({ prefix: "/api/v1/uploads" })
  .use(authPlugin)

  // --- Téléversement public (associé à un champ de formulaire) ---
  .use(
    makeRateLimit({
      max: 30,
      duration: 60_000,
      message: "Trop de téléversements. Veuillez patienter.",
    }),
  )
  .post(
    "/",
    async ({ body, set }) => {
      const form = await prisma.form.findUnique({ where: { id: body.formId } });
      if (!form || !form.isPublished) {
        set.status = 404;
        return { success: false, error: "Formulaire introuvable." };
      }

      const fields = form.schema as unknown as FieldDefinition[];
      const field = fields.find((f) => f.key === body.fieldKey && f.type === "file");
      if (!field) {
        set.status = 400;
        return { success: false, error: "Champ de fichier invalide." };
      }

      const file = body.file;
      const maxBytes = Math.min(field.maxSizeBytes ?? env.maxUploadBytes, env.maxUploadBytes);
      if (file.size > maxBytes) {
        set.status = 413;
        return { success: false, error: `Fichier trop volumineux (max ${maxBytes} octets).` };
      }
      if (!mimeAllowed(field.accept, file.type)) {
        set.status = 415;
        return { success: false, error: `Type de fichier non autorisé : ${file.type}.` };
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const checksum = sha256(bytes.toString("base64"));
      const storedName = `${randomToken(16)}`;
      await Bun.write(join(UPLOAD_ROOT, storedName), bytes);

      // Descripteur signé : réinjecté tel quel à la soumission, non falsifiable.
      const descriptor = {
        formId: form.id,
        fieldKey: field.key,
        storedName,
        originalName: file.name.slice(0, 255),
        mimeType: file.type,
        sizeBytes: file.size,
        checksum,
      };
      return { success: true, file: descriptor, signature: signDescriptor(descriptor) };
    },
    {
      body: t.Object({
        formId: t.String({ format: "uuid" }),
        fieldKey: t.String({ maxLength: 64 }),
        file: t.File({ maxSize: env.maxUploadBytes }),
      }),
    },
  )

  // --- Téléchargement réservé aux administrateurs autorisés ---
  .get(
    "/file/:id",
    async ({ params, auth, set }) => {
      const upload = await prisma.fileUpload.findUnique({
        where: { id: params.id },
        include: { response: { include: { form: { select: { id: true, ownerId: true } } } } },
      });
      if (!upload) {
        set.status = 404;
        return { success: false, error: "Fichier introuvable." };
      }
      const perm = await resolveFormPermission(
        prisma.formAccess,
        auth!.user,
        upload.response.form.id,
        upload.response.form.ownerId,
      );
      if (perm === "NONE") {
        set.status = 403;
        return { success: false, error: "Accès refusé." };
      }
      set.headers["Content-Type"] = upload.mimeType;
      set.headers["Content-Disposition"] =
        `attachment; filename="${encodeURIComponent(upload.originalName)}"`;
      return Bun.file(join(UPLOAD_ROOT, upload.storedName));
    },
    { params: t.Object({ id: t.String() }), requireRole: true },
  );

export { UPLOAD_ROOT };
