/**
 * File de livraison des intégrations sortantes.
 *
 * Une soumission n'appelle jamais un système tiers pendant la requête HTTP :
 * elle dépose une ligne `IntegrationDelivery`, et ce dispatcher la traite en
 * arrière-plan avec réessais à intervalle croissant. Deux conséquences :
 * le répondant n'attend pas la latence de l'ERP, et une indisponibilité
 * momentanée de Dolibarr ne perd plus d'inscription.
 */

import { prisma } from "./prisma.ts";
import { openContent } from "./crypto.ts";
import { credentialsFrom, syncResponse, DolibarrError } from "./dolibarr.ts";
import type { FieldMap, MappingConfig, ResponseValues } from "../lib/dolibarrMapping.ts";

/** Au-delà, on classe en FAILED et on attend un rejeu manuel. */
export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
/** Nombre de livraisons traitées par cycle — borne la charge sur l'ERP. */
const BATCH_SIZE = 20;
/** Durée pendant laquelle une livraison prise en charge est masquée aux autres cycles. */
const LEASE_MS = 2 * 60 * 1000;

/**
 * Report exponentiel plafonné : 30 s, 1 min, 2 min… jusqu'à 6 h.
 * Laisse le temps à une maintenance d'ERP de se terminer sans marteler le serveur.
 */
export function backoffDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

/** Programme les livraisons d'une réponse selon ce qui est configuré sur le formulaire. */
export async function enqueueDeliveries(form: {
  id: string;
  webhookUrl: string | null;
  dolibarrMapping?: { enabled: boolean } | null;
}, responseId: string): Promise<void> {
  const targets: ("WEBHOOK" | "DOLIBARR")[] = [];
  if (form.webhookUrl) targets.push("WEBHOOK");
  if (form.dolibarrMapping?.enabled) targets.push("DOLIBARR");
  if (targets.length === 0) return;

  await prisma.integrationDelivery.createMany({
    data: targets.map((target) => ({ formId: form.id, responseId, target })),
  });
}

/**
 * Traite les livraisons échues. Renvoie le nombre de lignes examinées, ce qui
 * permet à l'appelant de relancer immédiatement tant qu'il reste du travail.
 */
export async function runDueDeliveries(now: Date = new Date()): Promise<number> {
  const due = await prisma.integrationDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (due.length === 0) return 0;

  // Bail : on repousse les lignes retenues pour qu'un second cycle (ou une
  // seconde instance) ne les traite pas en parallèle.
  const ids = due.map((d) => d.id);
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  await prisma.integrationDelivery.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { nextAttemptAt: leaseUntil },
  });

  for (const id of ids) {
    await processDelivery(id).catch((err) => {
      console.error(`[deliveries] échec inattendu sur ${id} :`, err);
    });
  }

  return ids.length;
}

async function processDelivery(id: string): Promise<void> {
  const delivery = await prisma.integrationDelivery.findUnique({
    where: { id },
    include: {
      form: { include: { dolibarrMapping: { include: { connection: true } } } },
      response: true,
    },
  });
  if (!delivery || delivery.status !== "PENDING") return;

  // Le contenu n'est jamais dupliqué dans la file : on le relit (et le
  // déchiffre) à l'instant de l'envoi.
  const values = openContent(delivery.response.content) as ResponseValues;

  try {
    const result =
      delivery.target === "DOLIBARR"
        ? await deliverToDolibarr(delivery, values)
        : await deliverToWebhook(delivery, values);

    await prisma.integrationDelivery.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        attempts: { increment: 1 },
        completedAt: new Date(),
        lastError: null,
        lastResponse: result.detail.slice(0, 500),
        remoteRef: result.remoteRef ?? null,
      },
    });
  } catch (err) {
    await recordFailure(id, delivery.attempts, err);
  }
}

async function recordFailure(id: string, previousAttempts: number, err: unknown): Promise<void> {
  const attempts = previousAttempts + 1;
  const retryable = err instanceof DolibarrError ? err.retryable : true;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const giveUp = !retryable || exhausted;

  await prisma.integrationDelivery.update({
    where: { id },
    data: {
      attempts,
      status: giveUp ? "FAILED" : "PENDING",
      nextAttemptAt: giveUp ? new Date() : new Date(Date.now() + backoffDelayMs(attempts)),
      completedAt: giveUp ? new Date() : null,
      lastError: (err as Error).message.slice(0, 500),
      lastResponse: err instanceof DolibarrError ? (err.body?.slice(0, 500) ?? null) : null,
    },
  });
}

// ---------------------------------------------------------------------------
//  Destinations
// ---------------------------------------------------------------------------

type DeliveryWithRelations = Awaited<ReturnType<typeof prisma.integrationDelivery.findUnique>> & {
  form: { id: string; webhookUrl: string | null; dolibarrMapping: any };
  response: { id: string; submittedAt: Date };
};

async function deliverToWebhook(
  delivery: DeliveryWithRelations,
  values: ResponseValues,
): Promise<{ detail: string; remoteRef?: string }> {
  const url = delivery.form.webhookUrl;
  if (!url) throw new Error("Aucune URL de webhook configurée sur le formulaire.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "response.submitted",
      formId: delivery.form.id,
      responseId: delivery.response.id,
      submittedAt: delivery.response.submittedAt,
      values,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 500);
    throw new DolibarrError(
      `Le webhook a répondu ${res.status}.`,
      res.status,
      res.status === 408 || res.status === 429 || res.status >= 500,
      body,
    );
  }

  return { detail: `Webhook livré (HTTP ${res.status}).` };
}

async function deliverToDolibarr(
  delivery: DeliveryWithRelations,
  values: ResponseValues,
): Promise<{ detail: string; remoteRef?: string }> {
  const mapping = delivery.form.dolibarrMapping;
  if (!mapping || !mapping.enabled) {
    // Le mapping a été désactivé depuis la soumission : rejouer n'aurait pas de sens.
    throw new DolibarrError("L'export Dolibarr a été désactivé pour ce formulaire.", null, false);
  }

  const config: MappingConfig & { dedupe: "NONE" | "EMAIL" } = {
    target: mapping.target,
    dedupe: mapping.dedupe,
    fieldMap: (mapping.fieldMap ?? {}) as FieldMap,
    memberTypeId: mapping.memberTypeId,
    subscriptionAmount: mapping.subscriptionAmount,
    subscriptionAmountKey: mapping.subscriptionAmountKey,
    subscriptionMonths: mapping.subscriptionMonths,
  };

  const result = await syncResponse(credentialsFrom(mapping.connection), config, values);
  return { detail: result.detail, remoteRef: result.remoteRef };
}

// ---------------------------------------------------------------------------
//  Boucle de fond
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

/** Démarre le dispatcher. Appelé une fois au démarrage de l'API. */
export function startDeliveryWorker(intervalMs = 15_000): void {
  if (timer) return;
  timer = setInterval(() => {
    runDueDeliveries().catch((err) => console.error("[deliveries] cycle en échec :", err));
  }, intervalMs);
}

export function stopDeliveryWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
