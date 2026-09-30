// Types partagés côté frontend, alignés sur les schémas Typebox du backend.

/** Suffixe de clé utilisé pour stocker le texte de justification lié à un champ à choix (aligné sur le backend). */
export const JUSTIFICATION_SUFFIX = "__justification";

export type FieldType =
  | "short_text"
  | "paragraph"
  | "email"
  | "number"
  | "radio"
  | "checkbox"
  | "select"
  | "date"
  | "datetime"
  | "file"
  | "grid"
  | "linear_scale"
  | "checkbox_grid"
  | "section"
  | "text_block"
  | "signature"
  | "address"
  | "stripe_payment"
  /** Champ invisible : attribue au participant l'une de ses options (variante). */
  | "rotation";

export interface FieldOption {
  value: string;
  label: string;
  /** Couleur personnalisée (hex) utilisée pour représenter ce choix dans les statistiques (camembert...). */
  color?: string;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface FieldCondition {
  fieldKey: string;
  value: string;
}

export interface FieldDefinition {
  key: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[];
  allowOther?: boolean;
  requireJustification?: boolean;
  /** Champs "date"/"datetime" : afficher un bouton de remplissage auto avec la date/l'heure actuelle. */
  allowAutoToday?: boolean;
  condition?: FieldCondition;
  validation?: FieldValidation;
  accept?: string[];
  maxSizeBytes?: number;
  grid?: { rows: string[]; columns: string[] };
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
}

/** Une acceptation du consentement RGPD, avec sa propre case. */
export interface ConsentItem {
  /** Identifiant stable renvoyé à la soumission. */
  id: string;
  label: string;
  /** Faux : le répondant peut refuser et envoyer quand même. */
  required: boolean;
}

export type ConsentPosition = "START" | "END";

export type MetaColumnKind = "text" | "number" | "formula";

export interface MetaColumn {
  key: string;
  label: string;
  kind: MetaColumnKind;
  formula?: string;
}

export interface FormSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  isPublished: boolean;
  isAnonymized: boolean;
  encryptResponses: boolean;
  requireConsent: boolean;
  consentText?: string | null;
  /** Acceptations séparées (collecte, traitement, stockage…) ; vide = case unique. */
  consentItems?: ConsentItem[];
  /** Page où s'affichent les cases de consentement. */
  consentPosition?: ConsentPosition;
  /** Lien vers la politique de confidentialité affiché sous le consentement.
   *  Vide = page générique /legal/confidentialite de l'instance. */
  privacyPolicyUrl?: string | null;
  visibility: string;
  allowedEmails: string[];
  notifyOwner?: boolean;
  sendConfirmationEmail?: boolean;
  confirmationEmailText?: string | null;
  webhookUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxResponses?: number | null;
  translations?: any;
  /** Intégration du formulaire dans un site tiers (iframe, widget, clé d'embed). */
  embedEnabled?: boolean;
  /** Origines autorisées à l'intégrer ; liste vide = toutes. */
  embedOrigins?: string[];
  ownerId: string;
  organizationId?: string | null;
  updatedAt: string;
  _count?: { responses: number };
}

export interface FormDetail extends FormSummary {
  schema: FieldDefinition[];
  metaColumns: MetaColumn[];
  access?: FormAccessEntry[];
  owner?: { id: string; email: string; displayName: string | null };
  /** Organisation dont tous les membres ont accès au formulaire. */
  organization?: { id: string; name: string } | null;
  /** Habillage des exports statistiques ; voir $lib/exportTheme.ts. */
  exportTheme?: unknown;
}

export type FormRole = "VIEWER" | "COMMENTER" | "EDITOR";

export interface FormAccessEntry {
  id: string;
  userId: string;
  role: FormRole;
  user: { id: string; email: string; displayName: string | null };
}

/** Entrée d'historique : l'état du formulaire avant une modification. */
export interface FormVersion {
  id: string;
  createdAt: string;
  author: { id: string; email: string; displayName: string | null } | null;
}

export interface FormComment {
  id: string;
  formId: string;
  authorId: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; email: string; displayName: string | null };
}

/** Configuration de croisement enregistrée depuis la page Statistiques. */
export interface StatsPresetConfig {
  /** Clés des champs portés par l'axe des lignes (combinés entre eux). */
  rowFields: string[];
  /** Clés des champs portés par l'axe des colonnes. */
  colFields: string[];
  crossMode: "count" | "row" | "col" | "total";
  /** Filtres à choix : clé de champ → valeurs retenues. */
  extraFilters: Record<string, string[]>;
  /** Filtres numériques : clé de champ → bornes incluses. */
  numericFilters: Record<string, { min?: number; max?: number }>;
  dateStart?: string;
  dateEnd?: string;
}

export interface StatsPreset {
  id: string;
  name: string;
  /** Formulaires croisés : 1 seul = analyse simple, 2+ = comparaison de sources. */
  formIds: string[];
  config: StatsPresetConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * Portée d'une clé d'API :
 *  - FULL  : agit au nom du titulaire sur toute l'API (serveur MCP, scripts) ;
 *  - EMBED : lit un seul formulaire et y soumet des réponses. Publiable dans
 *            le code d'un site tiers.
 */
export type ApiKeyScope = "FULL" | "EMBED";

export interface ApiKeyInfo {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  scope?: ApiKeyScope;
  /** Formulaire ciblé par une clé EMBED. */
  formId?: string | null;
  form?: { title: string; slug: string } | null;
}

/**
 * Variantes attribuées au participant par les champs « Répartition » :
 * `assignments[clé du champ]` est l'option retenue, soit celle de rang
 * `seed % nombre d'options`.
 */
export interface PublicRotation {
  seed: number;
  assignments: Record<string, string>;
}

/** Réglages d'intégration d'un formulaire publié, servis sans authentification. */
export interface EmbedConfig {
  formId: string;
  title: string;
  enabled: boolean;
  origins: string[];
  /** Valeur prête à l'emploi pour la directive CSP `frame-ancestors`. */
  frameAncestors: string;
}

export interface UploadedFileInfo {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ResponseFileRef {
  id: string;
  fieldKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ResponseRow {
  id: string;
  submittedAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  files: ResponseFileRef[];
}

export type Role = "SUPER_ADMIN" | "EDITOR";

export interface User {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
  isActive?: boolean;
  createdAt?: string;
  /** `false` tant que l'utilisateur n'a pas défini son mot de passe via le lien d'invitation. */
  hasPassword?: boolean;
}

export type Permission = "NONE" | "VIEWER" | "COMMENTER" | "EDITOR";

export interface GlobalStats {
  forms: {
    total: number;
    published: number;
    draft: number;
  };
  responses: {
    total: number;
    today: number;
    week: number;
    month: number;
    monthDelta: number | null;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  topForms: {
    id: string;
    title: string;
    slug: string;
    isPublished: boolean;
    responseCount: number;
  }[];
  activity: { date: string; count: number }[];
}

export interface FormActivitySummary {
  formId: string;
  title: string;
  isPublished: boolean;
  totalResponses: number;
  activity: { date: string; count: number }[];
}

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

/** Rôle de la personne connectée vis-à-vis d'une organisation. */
export type OrgViewerRole = OrgRole | "SUPER_ADMIN";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  /** Présents dans la liste des organisations. */
  role?: OrgViewerRole;
  memberCount?: number;
  formCount?: number;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    /** Faux tant que la personne n'a pas activé son compte via l'invitation. */
    hasPassword?: boolean;
  };
}

