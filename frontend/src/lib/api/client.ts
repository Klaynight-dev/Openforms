/**
 * Client API typé (fetch) parlant à l'API ElysiaJS.
 *  - `credentials: 'include'` pour transporter le cookie de session HttpOnly.
 *  - Injection automatique de l'en-tête X-CSRF-Token (lu dans le cookie `csrf`)
 *    sur toutes les requêtes mutantes.
 */
import type {
  FormSummary,
  FormDetail,
  FieldDefinition,
  MetaColumn,
  ResponseRow,
  User,
  Permission,
  UploadedFileInfo,
  GlobalStats,
  FormActivitySummary,
  Organization,
  OrganizationMember,
} from "../types.ts";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie("csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (isJson && (payload as any)?.error) || `Erreur ${res.status}`;
    throw new ApiError(message, res.status, (payload as any)?.details);
  }
  return payload as T;
}

export const api = {
  base: API_BASE,

  // --- Auth ---
  login: (email: string, password: string) =>
    request<{ success: boolean; user: User; csrfToken: string }>("POST", "/api/v1/auth/login", {
      email,
      password,
    }),
  register: (email: string, password: string, displayName?: string) =>
    request<{ success: boolean; user: User; csrfToken: string }>("POST", "/api/v1/auth/register", {
      email,
      password,
      displayName,
    }),
  logout: () => request<{ success: boolean }>("POST", "/api/v1/auth/logout"),
  me: () =>
    request<{ authenticated: boolean; user?: User; csrfToken?: string }>("GET", "/api/v1/auth/me"),

  // --- Formulaires ---
  listForms: () => request<{ success: boolean; forms: FormSummary[] }>("GET", "/api/v1/forms"),
  getForm: (id: string) =>
    request<{ success: boolean; form: FormDetail; permission: Permission }>("GET", `/api/v1/forms/${id}`),
  getPublicForm: (slug: string) =>
    request<{ success: boolean; form: FormDetail }>("GET", `/api/v1/forms/public/${slug}`),
  createForm: (data: FormPayload) =>
    request<{ success: boolean; form: FormDetail }>("POST", "/api/v1/forms", data),
  updateForm: (id: string, data: FormPayload) =>
    request<{ success: boolean; form: FormDetail }>("PUT", `/api/v1/forms/${id}`, data),
  publishForm: (id: string, published: boolean) =>
    request<{ success: boolean; isPublished: boolean; slug: string }>(
      "POST",
      `/api/v1/forms/${id}/publish`,
      { published },
    ),
  deleteForm: (id: string) => request<{ success: boolean }>("DELETE", `/api/v1/forms/${id}`),
  duplicateForm: (id: string) =>
    request<{ success: boolean; form: FormDetail }>("POST", `/api/v1/forms/${id}/duplicate`),

  // --- Réponses / tableur ---
  listResponses: (formId: string) =>
    request<{
      success: boolean;
      permission: Permission;
      form: { id: string; title: string; schema: FieldDefinition[]; metaColumns: MetaColumn[] };
      rows: ResponseRow[];
    }>("GET", `/api/v1/responses/form/${formId}`),
  addResponseRow: (formId: string) =>
    request<{ success: boolean; row: ResponseRow }>("POST", `/api/v1/responses/form/${formId}`),
  updateCell: (responseId: string, target: "field" | "meta", key: string, value: unknown) =>
    request<{ success: boolean }>("PATCH", `/api/v1/responses/${responseId}/cell`, {
      target,
      key,
      value,
    }),
  deleteResponse: (responseId: string) =>
    request<{ success: boolean }>("DELETE", `/api/v1/responses/${responseId}`),
  submit: (payload: SubmitPayload) =>
    request<{ success: boolean; responseId?: string; details?: unknown }>(
      "POST",
      "/api/v1/responses/submit",
      payload,
    ),

  // --- Utilisateurs & accès ---
  listUsers: () => request<{ success: boolean; users: User[] }>("GET", "/api/v1/users"),
  createUser: (data: { email: string; password: string; role: string; displayName?: string }) =>
    request<{ success: boolean; user: User }>("POST", "/api/v1/users", data),
  updateUser: (id: string, data: Partial<{ role: string; displayName: string; isActive: boolean; password: string }>) =>
    request<{ success: boolean; user: User }>("PATCH", `/api/v1/users/${id}`, data),
  deleteUser: (id: string) => request<{ success: boolean }>("DELETE", `/api/v1/users/${id}`),
  grantAccess: (userId: string, formId: string, permission: "READ" | "WRITE") =>
    request<{ success: boolean }>("PUT", "/api/v1/access", { userId, formId, permission }),
  revokeAccess: (userId: string, formId: string) =>
    request<{ success: boolean }>("DELETE", "/api/v1/access", { userId, formId }),

  // --- Statistiques ---
  getGlobalStats: () =>
    request<{ success: boolean; stats: GlobalStats }>("GET", "/api/v1/stats"),
  getFormStatsSummary: (formId: string) =>
    request<{ success: boolean; summary: FormActivitySummary }>("GET", `/api/v1/stats/form/${formId}/summary`),

  // --- Organisations ---
  listOrganizations: () =>
    request<{ success: boolean; organizations: Organization[] }>("GET", "/api/v1/organizations"),
  createOrganization: (name: string) =>
    request<{ success: boolean; organization: Organization }>("POST", "/api/v1/organizations", { name }),
  getOrganization: (id: string) =>
    request<{ success: boolean; organization: Organization; role: string }>("GET", `/api/v1/organizations/${id}`),
  listOrgMembers: (id: string) =>
    request<{ success: boolean; members: OrganizationMember[] }>("GET", `/api/v1/organizations/${id}/members`),
  addOrgMember: (orgId: string, email: string, role: string) =>
    request<{ success: boolean; member: OrganizationMember }>("POST", `/api/v1/organizations/${orgId}/members`, { email, role }),
  removeOrgMember: (orgId: string, memberId: string) =>
    request<{ success: boolean }>("DELETE", `/api/v1/organizations/${orgId}/members/${memberId}`),

  // --- Upload de fichier (multipart) ---
  async uploadFile(
    formId: string,
    fieldKey: string,
    file: File,
  ): Promise<{ file: SignedFileDescriptor; signature: string }> {
    const fd = new FormData();
    fd.append("formId", formId);
    fd.append("fieldKey", fieldKey);
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/uploads`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const payload = await res.json();
    if (!res.ok) throw new ApiError(payload?.error ?? "Échec de l'envoi", res.status);
    return payload;
  },

  fileDownloadUrl: (fileId: string) => `${API_BASE}/api/v1/uploads/file/${fileId}`,
};

export interface FormPayload {
  title: string;
  description?: string;
  schema: FieldDefinition[];
  metaColumns?: MetaColumn[];
  requireConsent?: boolean;
  consentText?: string;
  isAnonymized?: boolean;
  encryptResponses?: boolean;
  organizationId?: string;
  visibility?: string;
  allowedEmails?: string[];
  notifyOwner?: boolean;
  sendConfirmationEmail?: boolean;
  confirmationEmailText?: string;
  webhookUrl?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  maxResponses?: number | null;
  translations?: any;
}

export interface SignedFileDescriptor {
  formId: string;
  fieldKey: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface SubmitPayload {
  formId: string;
  data: Record<string, unknown>;
  consent?: boolean;
  files?: Record<string, { file: SignedFileDescriptor; signature: string }[]>;
}

export type { UploadedFileInfo };
