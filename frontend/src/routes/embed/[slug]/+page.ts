import { api } from "$api/client.ts";
import type { PageLoad } from "./$types";

/**
 * Charge les réglages d'intégration du formulaire.
 *
 * Ils ne servent qu'à l'affichage : le cadrage lui-même est décidé par la
 * directive `frame-ancestors` posée sur le document (voir hooks.server.ts),
 * qu'une page ne peut pas contourner.
 */
export const load: PageLoad = async ({ params }) => {
  try {
    const res = await api.getEmbedConfig(params.slug);
    return { slug: params.slug, embedEnabled: res.embed.enabled, notFound: false };
  } catch {
    return { slug: params.slug, embedEnabled: false, notFound: true };
  }
};
