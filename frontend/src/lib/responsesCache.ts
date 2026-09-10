/**
 * Cache mémoire (côté client) des réponses d'un formulaire.
 *
 * Les pages "Réponses", "Stats" et "Canvas" appellent chacune `api.listResponses`
 * en montant leur route- l'API déchiffre (AES-256-GCM le cas échéant) et
 * sérialise l'intégralité des réponses à chaque appel. Pour un formulaire à
 * beaucoup de réponses, naviguer d'un onglet à l'autre refaisait ce travail
 * (réseau + déchiffrement + parsing JSON) à chaque fois.
 *
 * Ce module mémoïse le résultat en mémoire (module-level, donc partagé entre
 * les routes le temps de la session SPA) avec une courte durée de vie, et
 * expose une invalidation explicite à appeler après toute mutation (ajout /
 * édition / suppression de ligne) pour ne jamais servir de données périmées.
 */
import { api } from "./api/client.ts";
import type { FieldDefinition, MetaColumn, ResponseRow, Permission } from "./types.ts";

type ListResponsesResult = {
  success: boolean;
  permission: Permission;
  form: { id: string; title: string; schema: FieldDefinition[]; metaColumns: MetaColumn[] };
  rows: ResponseRow[];
};

const TTL_MS = 30_000;

const cache = new Map<string, { data: ListResponsesResult; expiresAt: number }>();
const inflight = new Map<string, Promise<ListResponsesResult>>();

/** Récupère les réponses d'un formulaire, en réutilisant un résultat récent si disponible. */
export function getResponsesCached(formId: string): Promise<ListResponsesResult> {
  const cached = cache.get(formId);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }

  const pending = inflight.get(formId);
  if (pending) return pending;

  const promise = api
    .listResponses(formId)
    .then((data) => {
      cache.set(formId, { data, expiresAt: Date.now() + TTL_MS });
      return data;
    })
    .finally(() => inflight.delete(formId));

  inflight.set(formId, promise);
  return promise;
}

/** À appeler après toute mutation (ajout/édition/suppression) pour forcer un rechargement frais. */
export function invalidateResponsesCache(formId: string): void {
  cache.delete(formId);
  inflight.delete(formId);
}
