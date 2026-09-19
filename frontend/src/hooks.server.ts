import type { Handle } from "@sveltejs/kit";

/**
 * Politique de cadrage des pages servies par le frontend.
 *
 * Tout le site refuse d'être placé dans un `<iframe>`- un écran
 * d'administration encadré par un site hostile, c'est du détournement de clic.
 * Seule /embed/:slug fait exception : c'est sa raison d'être, et elle pose
 * elle-même sa directive `frame-ancestors` à partir des origines autorisées
 * par le formulaire (voir embed/[slug]/+page.server.ts).
 *
 * `X-Frame-Options` n'est pas posé sur la page d'embed : il ne connaît pas de
 * liste d'origines (ALLOW-FROM est abandonné) et bloquerait l'intégration,
 * y compris chez les partenaires déclarés.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  if (!event.url.pathname.startsWith("/embed/")) {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return response;
};
