/**
 * Identité légale et paramètres publiés dans les pages `/legal/*`.
 *
 * Point de vérité unique : les quatre pages légales (mentions, CGU,
 * confidentialité, cookies) lisent toutes ce fichier. Une instance
 * auto-hébergée n'a donc qu'un seul fichier à adapter.
 *
 * ⚠️ Les valeurs marquées TODO doivent être complétées avant mise en ligne :
 * une mention légale incomplète est une infraction (art. 6-III LCEN).
 */

export const LEGAL = {
  /** Nom d'usage du service. */
  siteName: "Formulaire Humanitour",

  /** Éditeur du site : association loi 1901. */
  publisher: {
    legalName: "HUMANITOUR",
    form: "Association déclarée régie par la loi du 1er juillet 1901",
    rna: "W224012149",
    address: "9 lieu-dit Kersaint, 22120 Hillion, France",
    /** Déclaration en préfecture (récépissé de création). */
    declaration:
      "Déclarée à la préfecture des Côtes-d'Armor le 23 août 2026, récépissé n° W224012149 délivré le 7 septembre 2026",
    // TODO : renseigner le nom du président avant mise en ligne.
    publicationDirector: "Le président de l'association HUMANITOUR",
    // TODO : adresse de contact réellement relevée.
    email: "contact@humanitour.fr",
    // TODO : téléphone si l'association souhaite le publier (facultatif).
    phone: null as string | null,
  },

  /** Hébergeur du site et de la base de données. */
  // TODO : remplacer par l'hébergeur réel (raison sociale, adresse, téléphone).
  host: {
    name: "À compléter",
    address: "À compléter",
    phone: "À compléter",
  },

  /** Délégué à la protection des données (facultatif pour une association). */
  dpo: {
    designated: false,
    email: "contact@humanitour.fr",
  },

  /** Code source du service. */
  source: {
    license: "MIT",
    repository: "https://github.com/Klaynight/Openforms",
  },

  /** Durées de conservation annoncées (voir politique de confidentialité). */
  retention: {
    /** Durée de vie d'une session administrateur (SESSION_TTL côté API). */
    sessionDays: 7,
    /** Conservation par défaut des réponses, sauf purge demandée. */
    responsesMonths: 36,
    /** Conservation d'un compte administrateur inactif. */
    inactiveAccountMonths: 24,
  },

  /** Dernière révision des textes légaux. */
  lastUpdated: "10 septembre 2026",
} as const;

/** Navigation commune aux pages légales. */
export const LEGAL_PAGES = [
  { href: "/legal/mentions-legales", label: "Mentions légales" },
  { href: "/legal/cgu", label: "Conditions générales d'utilisation" },
  { href: "/legal/confidentialite", label: "Politique de confidentialité" },
  { href: "/legal/cookies", label: "Gestion des cookies" },
] as const;
