#!/usr/bin/env bun
/**
 * Serveur MCP Openforms (transport stdio), pour un client MCP local : Claude
 * Desktop, Claude Code, etc. Voir README.md pour le branchement.
 *
 * Les outils sont ceux de `backend/src/mcp/server.ts`, que le backend sert
 * aussi en HTTP sur `/api/mcp` : une seule définition pour les deux.
 *
 * Contrainte stdio : stdout transporte le protocole MCP. Toute trace doit
 * partir sur stderr, jamais sur stdout.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../../backend/src/mcp/server.ts";
import { callApi, apiUrl } from "./api.ts";

if (!process.env.OPENFORMS_API_KEY) {
  console.error(
    "[openforms-mcp] OPENFORMS_API_KEY absente : les outils répondront par une erreur " +
      "tant qu'une clé n'est pas fournie.",
  );
}
console.error(`[openforms-mcp] API cible : ${apiUrl}`);

const server = createMcpServer(callApi, {
  // Même origine que l'API derrière le reverse-proxy de production.
  appUrl: process.env.OPENFORMS_APP_URL ?? apiUrl,
});
await server.connect(new StdioServerTransport());
