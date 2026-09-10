/**
 * Client HTTP de l'API Openforms.
 *
 * Le serveur MCP n'accède jamais à la base directement : il consomme la même
 * API REST que l'interface web, autorisé par une clé d'API personnelle. Les
 * contrôles de permission (propriétaire, organisation, FormAccess, rôle) sont
 * donc exactement ceux de l'application- aucune élévation de privilège.
 */

const API_URL = (process.env.OPENFORMS_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_KEY = process.env.OPENFORMS_API_KEY ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function assertConfigured(): void {
  if (!API_KEY) {
    throw new Error(
      "OPENFORMS_API_KEY manquante. Générez une clé depuis Openforms (Réglages → Clés d'API) " +
        "et exposez-la au serveur MCP via la variable d'environnement OPENFORMS_API_KEY.",
    );
  }
}

export async function callApi<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  assertConfigured();

  const headers: Record<string, string> = { Authorization: `Bearer ${API_KEY}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (isJson && (payload as { error?: string })?.error) || `Erreur HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return payload as T;
}

export const apiUrl = API_URL;
