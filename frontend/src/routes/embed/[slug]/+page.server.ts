import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";

interface EmbedConfigResponse {
  success: boolean;
  error?: string;
  embed?: {
    formId: string;
    title: string;
    enabled: boolean;
    origins: string[];
    frameAncestors: string;
  };
}

/**
 * Prépare la page d'intégration.
 *
 * La directive `frame-ancestors` doit accompagner la réponse HTML : c'est le
 * navigateur du visiteur qui l'applique, avant même que le formulaire ne soit
 * chargé. Elle est donc résolue ici, côté serveur, à partir des origines
 * déclarées sur le formulaire- un contrôle côté client n'aurait aucune valeur,
 * la page hôte pouvant l'ignorer.
 */
export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  let config: EmbedConfigResponse;
  try {
    const res = await fetch(`${API_BASE}/api/v1/forms/public/${params.slug}/embed`);
    config = (await res.json()) as EmbedConfigResponse;
  } catch {
    throw error(502, "Le service de formulaires est injoignable.");
  }

  if (!config.success || !config.embed) {
    throw error(404, config.error ?? "Formulaire introuvable.");
  }

  setHeaders({
    "content-security-policy": `frame-ancestors ${config.embed.frameAncestors}`,
    // Les réglages d'intégration changent avec le formulaire : une réponse
    // mise en cache figerait la liste d'origines autorisées.
    "cache-control": "no-store",
  });

  return {
    slug: params.slug,
    title: config.embed.title,
    embedEnabled: config.embed.enabled,
  };
};
