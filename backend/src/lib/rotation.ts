import { prisma } from "../services/prisma.ts";
import { rotationAssignments, rotationFields, type FieldDefinition } from "./formSchema.ts";

/**
 * Numéro du participant suivant (0, 1, 2…), réservé de façon atomique.
 *
 * Le numéro est pris à l'ouverture du formulaire, pas à l'envoi : la liste
 * doit être connue avant que le participant la voie. Compter les réponses
 * déjà reçues ne convient pas : à la diffusion d'une enquête, des centaines de
 * personnes ouvrent le lien avant le premier envoi, et toutes recevraient la
 * même variante.
 */
export async function drawRotationSeed(formId: string): Promise<number> {
  const { rotationCounter } = await prisma.form.update({
    where: { id: formId },
    data: { rotationCounter: { increment: 1 } },
    select: { rotationCounter: true },
  });
  return rotationCounter - 1;
}

/**
 * Variantes à présenter au participant, ou `null` si le formulaire n'a aucun
 * champ « Répartition ».
 *
 * `previousSeed` est le numéro déjà attribué à ce navigateur : recharger la
 * page doit redonner la même liste sans consommer de nouveau numéro, sinon
 * les rechargements déséquilibreraient la répartition.
 */
export async function resolveRotation(
  form: { id: string; schema: unknown; rotationCounter: number },
  previousSeed: number | undefined,
): Promise<{ seed: number; assignments: Record<string, string> } | null> {
  const fields = form.schema as FieldDefinition[];
  if (rotationFields(fields).length === 0) return null;

  const reuse =
    previousSeed !== undefined &&
    Number.isInteger(previousSeed) &&
    previousSeed >= 0 &&
    previousSeed < form.rotationCounter;
  const seed = reuse ? previousSeed : await drawRotationSeed(form.id);
  return { seed, assignments: rotationAssignments(fields, seed) };
}
