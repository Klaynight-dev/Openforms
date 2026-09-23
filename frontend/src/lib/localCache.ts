/**
 * Cache persistant du navigateur (IndexedDB), clé → valeur.
 *
 * Sert à afficher tout de suite ce qui a déjà été chargé lors d'une visite
 * précédente (liste des formulaires, réponses, stats), le temps que l'API
 * confirme ou complète. Rien ici ne fait foi : chaque lecture est suivie d'une
 * synchro avec le serveur.
 *
 * Les réponses sont des données personnelles, déchiffrées côté API. Le cache
 * appartient donc à un seul compte : il est vidé à la déconnexion et dès qu'un
 * autre utilisateur se connecte dans le même navigateur.
 *
 * IndexedDB peut manquer (navigation privée, stockage bloqué) : toutes les
 * opérations échouent alors en silence, et l'application se comporte comme
 * sans cache.
 */

const DB_NAME = "openforms-cache";
const STORE = "entries";
const OWNER_KEY = "__owner";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Propriétaire courant du cache ; tant qu'il est inconnu, rien n'est lu ni écrit. */
let owner: string | null = null;

/**
 * Rattache le cache au compte connecté. Un changement de compte (ou une
 * déconnexion, `null`) efface tout ce que le précédent avait laissé.
 */
export async function bindCacheOwner(userId: string | null): Promise<void> {
  owner = userId;
  const previous = await run<string>("readonly", (s) => s.get(OWNER_KEY));
  if (previous === userId) return;
  await run("readwrite", (s) => s.clear());
  if (userId) await run("readwrite", (s) => s.put(userId, OWNER_KEY));
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (!owner) return undefined;
  return run<T>("readonly", (s) => s.get(key));
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  if (!owner) return;
  // Les objets réactifs de Svelte (proxies) ne passent pas le clonage
  // structuré d'IndexedDB : on stocke un instantané.
  const snapshot = JSON.parse(JSON.stringify(value));
  await run("readwrite", (s) => s.put(snapshot, key));
}

export async function cacheDelete(key: string): Promise<void> {
  if (!owner) return;
  await run("readwrite", (s) => s.delete(key));
}
