/**
 * Identité légale et paramètres publiés dans les pages `/legal/*`.
 *
 * Point de vérité unique : les cinq pages légales (mentions, CGU,
 * confidentialité, cookies, déontologie) lisent toutes ce fichier. Une
 * instance auto-hébergée n'a donc qu'un seul fichier à adapter.
 *
 * Les textes sont rédigés pour une activité d'institut d'études et de
 * sondages : ils renvoient à la loi n° 77-808 du 19 juillet 1977, à la
 * commission des sondages et au code ICC/ESOMAR, en plus du RGPD.
 *
 * ⚠️ Les valeurs marquées TODO doivent être vérifiées avant mise en ligne :
 * une mention légale incomplète est une infraction (art. 6-III LCEN).
 */

export const LEGAL = {
  /** Nom d'usage du service. */
  siteName: "Formulaire Humanitour",

  /** Activité déclarée, reprise en tête des mentions légales. */
  activity:
    "Institut d'études et de sondages : conception, administration et analyse d'enquêtes d'opinion et d'études quantitatives",

  /** Éditeur du site : association loi 1901. */
  publisher: {
    legalName: "HUMANITOUR",
    form: "Association déclarée régie par la loi du 1er juillet 1901",
    rna: "W224012149",
    address: "9 lieu-dit Kersaint, 22120 Hillion, France",
    /** Déclaration en préfecture (récépissé de création). */
    declaration:
      "Déclarée à la préfecture des Côtes-d'Armor le 23 août 2026, récépissé n° W224012149 délivré le 7 septembre 2026",
    publicationDirector: "Elouan PASSEREAU",
    // TODO : adresse de contact réellement relevée.
    email: "contact@humanitour.fr",
    // TODO : téléphone si l'association souhaite le publier (facultatif).
    phone: null as string | null,
  },

  /** Hébergeur du site et de la base de données. */
  host: {
    name: "Contabo GmbH",
    address: "Aschauer Straße 32a, 81549 Munich, Allemagne",
    phone: "+49 89 3564717 70",
    website: "https://contabo.com",
    // TODO : confirmer la région du serveur loué ; Contabo exploite aussi des
    // centres de données hors UE (États-Unis, Singapour, Japon, Australie).
    // Hors UE, il faut documenter le transfert (clauses contractuelles types).
    dataCenter: "Nuremberg, Allemagne (Union européenne)",
  },

  /** Délégué à la protection des données (facultatif pour une association). */
  dpo: {
    designated: false,
    email: "contact@humanitour.fr",
  },

  /** Cadre déontologique de l'activité de sondage. */
  polling: {
    /** Code professionnel dont l'institut s'engage à respecter les règles. */
    code: "code international ICC/ESOMAR des études de marché, d'opinion et sociales",
    // TODO : passer à `true` uniquement si une adhésion formelle est souscrite.
    // Se dire membre sans l'être serait une pratique commerciale trompeuse.
    esomarMember: false,
    /** L'institut publie-t-il des sondages liés au débat électoral ? */
    electoralPolls: true,
    commissionUrl: "https://www.commission-des-sondages.fr",
  },

  /** Code source du service. */
  source: {
    license: "MIT",
    repository: "https://github.com/Klaynight/Openforms",
  },

  /** Durées de conservation annoncées (voir politique de confidentialité). */
  retention: {
    /** Durée de vie d'une session chargé d'études (SESSION_TTL côté API). */
    sessionDays: 7,
    /** Données brutes identifiantes d'une enquête, avant anonymisation. */
    rawSurveyMonths: 24,
    /** Coordonnées d'un panéliste, après son dernier contact avec l'institut. */
    panelInactivityMonths: 36,
    /** Conservation d'un compte interne inactif. */
    inactiveAccountMonths: 24,
    /** Conservation de la notice méthodologique d'un sondage publié. */
    methodologyYears: 5,
  },

  /** Dernière révision des textes légaux. */
  lastUpdated: "10 septembre 2026",
} as const;

/** Navigation commune aux pages légales. */
export const LEGAL_PAGES = [
  { href: "/legal/mentions-legales", label: "Mentions légales", short: "Mentions légales" },
  { href: "/legal/cgu", label: "Conditions générales d'utilisation", short: "CGU" },
  { href: "/legal/confidentialite", label: "Politique de confidentialité", short: "Confidentialité" },
  { href: "/legal/cookies", label: "Gestion des cookies", short: "Cookies" },
  { href: "/legal/deontologie", label: "Déontologie des sondages", short: "Déontologie" },
] as const;
