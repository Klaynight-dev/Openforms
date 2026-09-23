/**
 * Cache (côté client) des réponses d'un formulaire.
 *
 * Les pages "Réponses", "Stats" et "Canvas" lisent toutes les réponses du
 * formulaire. Les redemander en entier à chaque visite coûtait cher : l'API
 * déchiffre (AES-256-GCM le cas échéant) et sérialise tout, le navigateur
 * retélécharge et reparse tout.
 *
 * Deux niveaux :
 *  - en mémoire, pour passer d'un onglet à l'autre sans réseau (TTL court) ;
 *  - dans IndexedDB (voir localCache.ts), pour les visites suivantes. On ne
 *    redemande alors à l'API que les lignes modifiées depuis la dernière
 *    synchro (`?since=`), plus la liste des identifiants pour écarter les
 *    lignes supprimées.
 *
 * `invalidateResponsesCache` est à appeler après toute mutation (ajout /
 * édition / suppression de ligne, évènement temps réel) : la lecture suivante
 * repasse par l'API, en incrémental.
 */
import { api, ApiError } from "./api/client.ts";
import { cacheDelete, cacheGet, cacheSet } from "./localCache.ts";
import { mergeResponseRows } from "./responsesSync.ts";
import type { FieldDefinition, MetaColumn, ResponseRow, Permission } from "./types.ts";

type ListResponsesResult = {
  success: boolean;
  permission: Permission;
  form: { id: string; title: string; schema: FieldDefinition[]; metaColumns: MetaColumn[] };
  rows: ResponseRow[];
};

type StoredResponses = { data: ListResponsesResult; syncedAt: string };

const TTL_MS = 30_000;

const memory = new Map<string, { entry: StoredResponses; expiresAt: number }>();
const inflight = new Map<string, Promise<ListResponsesResult>>();

const storageKey = (formId: string) => `responses:${formId}`;

async function stored(formId: string): Promise<StoredResponses | undefined> {
  return memory.get(formId)?.entry ?? (await cacheGet<StoredResponses>(storageKey(formId)));
}

async function sync(formId: string): Promise<ListResponsesResult> {
  const previous = await stored(formId);
  let res: Awaited<ReturnType<typeof api.listResponses>>;
  try {
    res = await api.listResponses(formId, previous?.syncedAt);
  } catch (e) {
    // Accès retiré ou formulaire supprimé : le cache ne doit pas survivre.
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      memory.delete(formId);
      await cacheDelete(storageKey(formId));
    }
    throw e;
  }

  const rows =
    res.delta && previous && res.ids ? mergeResponseRows(previous.data.rows, res.rows, res.ids) : res.rows;
  const data: ListResponsesResult = { success: res.success, permission: res.permission, form: res.form, rows };

  // Une API antérieure au paramètre `since` ne renvoie pas `syncedAt` : on
  // garde alors le cache mémoire, sans rien persister d'incrémentable.
  if (res.syncedAt) {
    const entry = { data, syncedAt: res.syncedAt };
    memory.set(formId, { entry, expiresAt: Date.now() + TTL_MS });
    void cacheSet(storageKey(formId), entry);
  }
  return data;
}

/** Récupère les réponses d'un formulaire, à jour avec l'API. */
export function getResponsesCached(formId: string): Promise<ListResponsesResult> {
  const cached = memory.get(formId);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.entry.data);
  }

  const pending = inflight.get(formId);
  if (pending) return pending;

  const promise = sync(formId).finally(() => inflight.delete(formId));
  inflight.set(formId, promise);
  return promise;
}

/**
 * Dernières réponses connues, sans passer par le réseau : de quoi afficher la
 * page tout de suite, avant que `getResponsesCached` confirme.
 */
export async function peekResponses(formId: string): Promise<ListResponsesResult | undefined> {
  return (await stored(formId))?.data;
}

/** À appeler après toute mutation : la lecture suivante resynchronise avec l'API. */
export function invalidateResponsesCache(formId: string): void {
  const cached = memory.get(formId);
  if (cached) cached.expiresAt = 0;
  inflight.delete(formId);
}

/** Oublie tout le cache mémoire (déconnexion, changement de compte). */
export function forgetResponses(): void {
  memory.clear();
  inflight.clear();
}
