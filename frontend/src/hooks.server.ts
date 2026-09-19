import type { Handle } from "@sveltejs/kit";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";

/** `/embed/<slug>` : le document d'intégration, et lui seul. */
const EMBED_PAGE = /^\/embed\/([^/]+)\/?$/;

/**
 * Politique de cadrage des pages servies par le frontend.
 *
 * Tout le site refuse d'être placé dans un `<iframe>`- un écran
 * d'administration encadré par un site hostile, c'est du détournement de clic.
 * Seule /embed/:slug fait exception : c'est sa raison d'être. Sa directive
 * `frame-ancestors` est construite ici, à partir des origines autorisées par
 * le formulaire.
 *
 * Ce contrôle vit dans le hook et non dans un `load` de page parce que
 * l'application est rendue côté client (`ssr = false` dans +layout.ts) : les
 * en-têtes posés par un `load` accompagnent la requête de données, jamais le
 * document HTML- or c'est sur le document que le navigateur applique
 * `frame-ancestors`.
 *
 * `X-Frame-Options` n'est pas posé sur la page d'embed : il ne connaît pas de
 * liste d'origines (ALLOW-FROM est abandonné) et bloquerait l'intégration,
 * y compris chez les partenaires déclarés.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const embedded = EMBED_PAGE.exec(event.url.pathname);
  const response = await resolve(event);

  if (!embedded) {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    return response;
  }

  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${await frameAncestorsFor(embedded[1], event.fetch)}`,
  );
  // Les origines autorisées changent avec le formulaire : une réponse mise en
  // cache figerait la liste, chez le visiteur comme dans un proxy.
  response.headers.set("Cache-Control", "no-store");
  return response;
};

/**
 * Interroge l'API pour la directive à appliquer. En cas d'échec- API
 * injoignable, formulaire inconnu- on refuse le cadrage : mieux vaut une
 * intégration qui ne s'affiche pas qu'une page d'administration encadrable
 * parce qu'une requête a échoué.
 */
async function frameAncestorsFor(slug: string, fetcher: typeof fetch): Promise<string> {
  try {
    const res = await fetcher(`${API_BASE}/api/v1/forms/public/${encodeURIComponent(slug)}/embed`);
    if (!res.ok) return "'none'";
    const payload = (await res.json()) as { embed?: { frameAncestors?: string } };
    return payload.embed?.frameAncestors ?? "'none'";
  } catch {
    return "'none'";
  }
}
