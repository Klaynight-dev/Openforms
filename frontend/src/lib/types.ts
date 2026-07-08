// Types partagés côté frontend, alignés sur les schémas Typebox du backend.

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
  | "section";

export interface FieldOption {
  value: string;
  label: string;
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
  condition?: FieldCondition;
  validation?: FieldValidation;
  accept?: string[];
  maxSizeBytes?: number;
  grid?: { rows: string[]; columns: string[] };
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
}

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
  updatedAt: string;
  _count?: { responses: number };
}

export interface FormDetail extends FormSummary {
  schema: FieldDefinition[];
  metaColumns: MetaColumn[];
  ownerId: string;
  access?: FormAccessEntry[];
}

export interface FormAccessEntry {
  id: string;
  userId: string;
  permission: "READ" | "WRITE";
  user: { id: string; email: string; displayName: string | null };
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
}

export type Permission = "NONE" | "READ" | "WRITE";

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

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

