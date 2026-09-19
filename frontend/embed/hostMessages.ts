/**
 * Lecture des messages remontés par un formulaire intégré.
 *
 * Isolé du widget parce que c'est la pièce sensible : la page hôte reçoit
 * `message` de *toutes* les fenêtres avec lesquelles elle est en relation.
 * Sans filtrage, n'importe quel autre cadre de la page pourrait redimensionner
 * le formulaire ou déclencher le rappel « réponse enregistrée ».
 */

/** Action à appliquer par la page hôte, une fois le message jugé légitime. */
export type HostAction =
  | { kind: "resize"; height: number }
  | { kind: "scroll" }
  | { kind: "submitted"; responseId: string | undefined };

/** Ce qu'un message doit prouver pour être pris en compte. */
export interface HostExpectation {
  /** Origine du cadre, telle que la page hôte l'a construite. */
  origin: string;
  /** Fenêtre du cadre : écarte un message d'une autre fenêtre de même origine. */
  source: unknown;
  /** Formulaire attendu : deux formulaires peuvent cohabiter sur la page. */
  slug: string;
}

/** Message tel qu'il arrive, sans rien présumer de son contenu. */
export interface IncomingMessage {
  origin: string;
  source: unknown;
  data: unknown;
}

/**
 * Traduit un message en action, ou `null` s'il ne vient pas du bon cadre, ne
 * concerne pas ce formulaire, ou n'est pas exploitable.
 */
export function interpretHostMessage(
  message: IncomingMessage,
  expected: HostExpectation,
): HostAction | null {
  if (message.origin !== expected.origin) return null;
  if (message.source !== expected.source) return null;

  const data = message.data as { type?: unknown; slug?: unknown; height?: unknown; responseId?: unknown };
  if (!data || typeof data !== "object") return null;
  if (data.slug !== expected.slug) return null;

  switch (data.type) {
    case "openforms:resize":
      // Une hauteur absurde (négative, NaN, infinie) casserait la mise en page
      // de l'hôte : on préfère ignorer le message.
      if (typeof data.height !== "number" || !Number.isFinite(data.height) || data.height <= 0) {
        return null;
      }
      return { kind: "resize", height: data.height };
    case "openforms:scroll":
      return { kind: "scroll" };
    case "openforms:submitted":
      return {
        kind: "submitted",
        responseId: typeof data.responseId === "string" ? data.responseId : undefined,
      };
    default:
      return null;
  }
}
