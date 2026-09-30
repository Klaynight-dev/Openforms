import { Elysia } from "elysia";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { env } from "../config/env.ts";
import { resolveApiKey } from "../lib/apiKey.ts";
import { makeRateLimit } from "../middleware/security.ts";
import { ApiError, createMcpServer, type CallApi } from "../mcp/server.ts";

/**
 * Endpoint MCP (Streamable HTTP, sans état) : `https://<domaine>/api/mcp`.
 *
 * Authentification par clé d'API personnelle, de deux façons :
 *  - `Authorization: Bearer ofk_…` (Claude Code, clients qui gèrent les en-têtes) ;
 *  - `?key=ofk_…` dans l'URL, pour les connecteurs personnalisés de claude.ai qui
 *    n'acceptent qu'une URL. La clé est alors un secret : ne pas partager l'URL.
 *
 * Le serveur n'élève aucun droit : chaque outil rappelle l'API REST avec la clé
 * de l'appelant, donc les permissions sont celles de son compte.
 */

const mcpRateLimit = makeRateLimit({
  max: 120,
  duration: 60_000,
  message: "Trop de requêtes MCP, réessayez dans un instant.",
});

function extractKey(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("key")?.trim() || undefined;
}

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Client de l'API REST pour une clé donnée, en boucle locale. */
function apiCaller(token: string): CallApi {
  const base = `http://127.0.0.1:${env.port}`;
  return async (method, path, body) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${base}${path}`, {
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
    return payload as never;
  };
}

export const mcpController = new Elysia({ prefix: "/api/mcp" })
  .use(mcpRateLimit)
  .post(
    "/",
    async ({ request }) => {
      const token = extractKey(request);
      const auth = await resolveApiKey(token);
      if (!auth || auth.apiKey.scope !== "FULL") {
        return jsonRpcError(401, "Clé d'API absente, invalide ou limitée à l'intégration.", {
          "www-authenticate": 'Bearer realm="openforms"',
        });
      }

      // Sans état : un serveur et un transport par requête, aucune session à purger.
      const server = createMcpServer(apiCaller(token!));
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      return transport.handleRequest(request);
    },
    { parse: "none" },
  )
  // Pas de flux serveur→client ni de session à fermer en mode sans état.
  .get("/", () => jsonRpcError(405, "Méthode non autorisée.", { allow: "POST" }))
  .delete("/", () => jsonRpcError(405, "Méthode non autorisée.", { allow: "POST" }));
