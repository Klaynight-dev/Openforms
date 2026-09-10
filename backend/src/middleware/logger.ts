import { Elysia } from "elysia";

/**
 * Log de chaque requête HTTP (méthode, chemin, statut, durée) sur stdout.
 * Sert de base de debug côté back (ex: repérer une requête qui échoue en
 * base avant même que l'erreur ne remonte au client).
 */
const startTimes = new WeakMap<Request, number>();

export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request }) => {
    startTimes.set(request, performance.now());
  })
  .onAfterResponse(({ request, set, path }) => {
    const start = startTimes.get(request);
    startTimes.delete(request);
    const durationMs = start ? (performance.now() - start).toFixed(1) : "?";
    const status = set.status ?? 200;
    console.log(`[req] ${request.method} ${path} -> ${status} (${durationMs}ms)`);
  });
