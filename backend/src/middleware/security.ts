import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { env } from "../config/env.ts";

/**
 * En-têtes de sécurité HTTP appliqués à toutes les réponses.
 * Pas de tracker, politique stricte : cohérent avec l'esprit « éthique ».
 */
export const securityHeaders = new Elysia({ name: "security-headers" }).onRequest(({ set }) => {
  set.headers["X-Content-Type-Options"] = "nosniff";
  set.headers["X-Frame-Options"] = "DENY";
  set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  set.headers["X-DNS-Prefetch-Control"] = "off";
  set.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";
  if (env.isProduction) {
    set.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
});

/**
 * CORS sélectif avec cookies (credentials).
 *  - Production : uniquement les origines déclarées dans FRONTEND_ORIGIN.
 *  - Développement : on tolère en plus n'importe quel port de localhost
 *    (Vite bascule de port si 5173 est occupé), pour éviter les blocages CORS.
 */
const isDevLocalhost = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

export const corsPlugin = cors({
  origin: (request: Request) => {
    const origin = request.headers.get("origin") ?? "";
    if (env.frontendOrigins.includes(origin)) return true;
    if (!env.isProduction && isDevLocalhost(origin)) return true;
    return false;
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"],
});

/**
 * Limiteur de débit générique. `elysia-rate-limit` compte par IP.
 * Utilisé pour brider les endpoints sensibles (login) et publics (submit).
 */
export function makeRateLimit(options: { max: number; duration: number; message: string }) {
  return rateLimit({
    duration: options.duration,
    max: options.max,
    scoping: "scoped",
    generator: (request, server) => {
      const fwd = request.headers.get("x-forwarded-for");
      if (fwd) return fwd.split(",")[0]?.trim();
      const realIp = request.headers.get("x-real-ip");
      if (realIp) return realIp;
      
      try {
        const ip = server?.requestIP(request)?.address;
        if (ip) return ip;
      } catch {}
      
      return "127.0.0.1";
    },
    errorResponse: new Response(JSON.stringify({ success: false, error: options.message }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }),
  });
}

/** Options standard d'un cookie de session HttpOnly sécurisé. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
