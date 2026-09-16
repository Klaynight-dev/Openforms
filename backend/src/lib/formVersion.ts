import { Prisma } from "@prisma/client";
import { prisma } from "../services/prisma.ts";

/**
 * Historique des versions d'un formulaire.
 *
 * Chaque entrée conserve l'état des champs éditables *avant* une modification :
 * restaurer une version, c'est revenir à ce qu'était le formulaire à ce
 * moment-là.
 */

/** Colonnes non restaurables : identité, URL publique, publication, horodatage. */
const SYSTEM_FIELDS = new Set([
  "id",
  "slug",
  "ownerId",
  "organizationId",
  "isPublished",
  "createdAt",
  "updatedAt",
]);

/**
 * Champs restaurables et leur type, lus dans le modèle courant : un instantané
 * ancien peut mentionner une colonne supprimée ou renommée depuis, qu'il faut
 * ignorer au lieu de la renvoyer telle quelle à Prisma.
 */
const RESTORABLE_FIELDS = new Map<string, string>(
  (Prisma.dmmf.datamodel.models.find((model) => model.name === "Form")?.fields ?? [])
    .filter((field) => field.kind === "scalar" && !SYSTEM_FIELDS.has(field.name))
    .map((field) => [field.name, field.type]),
);

/** Durée pendant laquelle les enregistrements d'un même auteur sont regroupés. */
const COALESCE_WINDOW_MS = 5 * 60 * 1000;

/** Nombre de versions conservées par formulaire. */
const MAX_VERSIONS = 50;

/** Réduit une ligne `Form` aux champs que l'historique sait restaurer. */
export function snapshotOf(form: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(form).filter(([key]) => RESTORABLE_FIELDS.has(key)));
}

/**
 * Conserve l'état du formulaire avant modification.
 *
 * L'enregistrement étant automatique côté client, une version par requête
 * saturerait l'historique : tant que le même auteur continue d'éditer, la
 * version déjà posée (plus ancienne, donc plus utile pour revenir en arrière)
 * est conservée telle quelle.
 */
export async function recordFormVersion(
  form: Record<string, unknown> & { id: string },
  authorId: string,
): Promise<void> {
  const latest = await prisma.formVersion.findFirst({
    where: { formId: form.id },
    orderBy: { createdAt: "desc" },
    select: { authorId: true, createdAt: true },
  });

  if (
    latest &&
    latest.authorId === authorId &&
    Date.now() - latest.createdAt.getTime() < COALESCE_WINDOW_MS
  ) {
    return;
  }

  await prisma.formVersion.create({
    data: { formId: form.id, authorId, snapshot: snapshotOf(form) as object },
  });

  const stale = await prisma.formVersion.findMany({
    where: { formId: form.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_VERSIONS,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.formVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
  }
}

/** Traduit un instantané en payload de mise à jour Prisma (dates comprises). */
export function snapshotToUpdateData(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object") return {};

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
    const type = RESTORABLE_FIELDS.get(key);
    if (!type) continue;
    // Les dates traversent le JSON sous forme de chaîne ISO.
    data[key] = type === "DateTime" && typeof value === "string" ? new Date(value) : value;
  }
  return data;
}
