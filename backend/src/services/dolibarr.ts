/**
 * Client de l'API REST Dolibarr.
 *
 * Dolibarr expose son API sous `<racine>/api/index.php/<ressource>` et
 * authentifie par l'en-tête `DOLAPIKEY`. Les noms de ressources et la syntaxe
 * `sqlfilters` varient d'une version majeure à l'autre : ce module isole ces
 * détails pour qu'une montée de version de l'ERP ne se propage pas ailleurs.
 */

import { decryptJson } from "./crypto.ts";
import {
  buildContactPayload,
  buildMemberPayload,
  buildSubscriptionPayload,
  buildThirdPartyPayload,
  extractEmail,
  type MappingConfig,
  type ResponseValues,
} from "../lib/dolibarrMapping.ts";

export interface DolibarrCredentials {
  baseUrl: string;
  apiKey: string;
  insecureTls?: boolean;
}

/** Échec applicatif du connecteur, porteur du caractère réessayable ou non. */
export class DolibarrError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** `false` pour une erreur de configuration : réessayer n'y changera rien. */
    readonly retryable: boolean,
    readonly body?: string,
  ) {
    super(message);
    this.name = "DolibarrError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Déchiffre la clé API stockée et compose les identifiants d'appel. */
export function credentialsFrom(connection: {
  baseUrl: string;
  apiKeyEnc: string;
  insecureTls: boolean;
}): DolibarrCredentials {
  return {
    baseUrl: connection.baseUrl,
    apiKey: decryptJson<string>(connection.apiKeyEnc),
    insecureTls: connection.insecureTls,
  };
}

/**
 * Un 4xx traduit une charge utile ou des droits incorrects : le rejouer à
 * l'identique échouera pareil. Seuls les 408/429 et les 5xx méritent un
 * réessai, au même titre que les erreurs réseau.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function dolibarrRequest<T = unknown>(
  credentials: DolibarrCredentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${credentials.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        DOLAPIKEY: credentials.apiKey,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Bun accepte `tls` par requête ; utile pour les ERP internes en auto-signé.
      ...(credentials.insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
    } as RequestInit);
  } catch (err) {
    // Panne réseau, DNS, timeout : toujours réessayable.
    throw new DolibarrError(`Dolibarr injoignable : ${(err as Error).message}`, null, true);
  }

  const text = await res.text();

  if (!res.ok) {
    throw new DolibarrError(
      `Dolibarr a répondu ${res.status} sur ${init.method ?? "GET"} ${path}`,
      res.status,
      isRetryableStatus(res.status),
      text.slice(0, 500),
    );
  }

  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DolibarrError("Réponse Dolibarr illisible (JSON attendu).", res.status, false, text.slice(0, 500));
  }
}

/**
 * Vérifie l'accès à une instance. `/status` est public sur les versions
 * récentes ; on retombe sur `/users/info` qui, lui, valide vraiment la clé.
 */
export async function testConnection(credentials: DolibarrCredentials): Promise<{ version?: string }> {
  const status = await dolibarrRequest<{ success?: { dolibarr_version?: string } }>(credentials, "status");
  // Un statut lisible ne prouve pas que la clé est bonne : on force un appel authentifié.
  await dolibarrRequest(credentials, "users/info");
  return { version: status?.success?.dolibarr_version };
}

// ---------------------------------------------------------------------------
//  Recherche (déduplication)
// ---------------------------------------------------------------------------

/** Échappe une valeur destinée à la clause `sqlfilters` de Dolibarr. */
function escapeSqlFilterValue(value: string): string {
  return value.replace(/['\\]/g, "\\$&");
}

/**
 * Recherche un objet par email. Dolibarr renvoie 404 — et non une liste vide —
 * quand rien ne correspond : ce cas n'est donc pas une erreur.
 */
async function findByEmail(
  credentials: DolibarrCredentials,
  resource: "members" | "thirdparties",
  email: string,
): Promise<{ id: number } | null> {
  const filter = encodeURIComponent(`(t.email:=:'${escapeSqlFilterValue(email)}')`);
  try {
    const rows = await dolibarrRequest<Array<{ id: number | string }>>(
      credentials,
      `${resource}?limit=1&sqlfilters=${filter}`,
    );
    const first = Array.isArray(rows) ? rows[0] : null;
    return first ? { id: Number(first.id) } : null;
  } catch (err) {
    if (err instanceof DolibarrError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
//  Synchronisation d'une soumission
// ---------------------------------------------------------------------------

export interface SyncResult {
  /** Référence lisible de ce qui a été créé ou mis à jour, ex. "member:42". */
  remoteRef: string;
  detail: string;
}

/**
 * Pousse une réponse vers Dolibarr selon la cible configurée.
 * Toute erreur remonte en `DolibarrError` pour que l'appelant sache si le
 * réessai a un sens.
 */
export async function syncResponse(
  credentials: DolibarrCredentials,
  config: MappingConfig & { dedupe: "NONE" | "EMAIL" },
  values: ResponseValues,
): Promise<SyncResult> {
  if (config.target === "THIRDPARTY_CONTACT") {
    return syncThirdPartyContact(credentials, config, values);
  }
  return syncMember(credentials, config, values);
}

async function syncMember(
  credentials: DolibarrCredentials,
  config: MappingConfig & { dedupe: "NONE" | "EMAIL" },
  values: ResponseValues,
): Promise<SyncResult> {
  const payload = buildMemberPayload(config, values);
  const email = config.dedupe === "EMAIL" ? extractEmail(payload) : null;

  const existing = email ? await findByEmail(credentials, "members", email) : null;

  let memberId: number;
  let detail: string;
  if (existing) {
    await dolibarrRequest(credentials, `members/${existing.id}`, { method: "PUT", body: payload });
    memberId = existing.id;
    detail = `Adhérent ${memberId} mis à jour.`;
  } else {
    const created = await dolibarrRequest<number | string>(credentials, "members", {
      method: "POST",
      body: payload,
    });
    memberId = Number(created);
    if (!Number.isFinite(memberId)) {
      throw new DolibarrError("Dolibarr n'a pas renvoyé d'identifiant d'adhérent.", null, false);
    }
    detail = `Adhérent ${memberId} créé.`;
  }

  if (config.target === "MEMBER_WITH_SUBSCRIPTION") {
    const subscription = buildSubscriptionPayload(config, values);
    if (!subscription) {
      // Configuration incohérente : inutile de rejouer.
      throw new DolibarrError("Montant de cotisation introuvable dans la réponse.", null, false);
    }
    await dolibarrRequest(credentials, `members/${memberId}/subscriptions`, {
      method: "POST",
      body: subscription,
    });
    detail += ` Cotisation de ${subscription.amount} € enregistrée.`;
  }

  return { remoteRef: `member:${memberId}`, detail };
}

async function syncThirdPartyContact(
  credentials: DolibarrCredentials,
  config: MappingConfig & { dedupe: "NONE" | "EMAIL" },
  values: ResponseValues,
): Promise<SyncResult> {
  const payload = buildThirdPartyPayload(config, values);
  if (!payload.name) {
    throw new DolibarrError("Impossible de déterminer le nom du tiers (name, ou lastname/firstname).", null, false);
  }

  const email = config.dedupe === "EMAIL" ? extractEmail(payload) : null;
  const existing = email ? await findByEmail(credentials, "thirdparties", email) : null;

  let socid: number;
  let detail: string;
  if (existing) {
    await dolibarrRequest(credentials, `thirdparties/${existing.id}`, { method: "PUT", body: payload });
    socid = existing.id;
    detail = `Tiers ${socid} mis à jour.`;
  } else {
    const created = await dolibarrRequest<number | string>(credentials, "thirdparties", {
      method: "POST",
      body: payload,
    });
    socid = Number(created);
    if (!Number.isFinite(socid)) {
      throw new DolibarrError("Dolibarr n'a pas renvoyé d'identifiant de tiers.", null, false);
    }
    detail = `Tiers ${socid} créé.`;
  }

  const contact = buildContactPayload(config, values, socid);
  if (contact.lastname) {
    const contactId = await dolibarrRequest<number | string>(credentials, "contacts", {
      method: "POST",
      body: contact,
    });
    detail += ` Contact ${contactId} rattaché.`;
  }

  return { remoteRef: `thirdparty:${socid}`, detail };
}
