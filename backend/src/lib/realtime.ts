/**
 * Diffusion temps réel (WebSocket).
 *
 * Les topics sont cloisonnés par formulaire : un client ne peut s'y abonner
 * qu'avec un accès effectif sur le formulaire (voir ws.controller.ts).
 *
 * La diffusion passe par le serveur Bun, qui porte le pub/sub natif des
 * WebSockets. On le mémorise au démarrage plutôt que de le lire dans le
 * contexte Elysia : celui-ci ne le transmet pas aux handlers WebSocket.
 */

export interface RealtimeResponseRow {
  id: string;
  submittedAt: Date;
  updatedAt: Date;
  values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  files: {
    id: string;
    fieldKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
}

export interface PresenceUser {
  id: string;
  name: string;
}

export type RealtimeEvent =
  | { type: "response:created"; formId: string; row: RealtimeResponseRow }
  | {
      type: "response:updated";
      formId: string;
      responseId: string;
      target: "field" | "meta";
      key: string;
      value: unknown;
    }
  | { type: "response:deleted"; formId: string; responseId: string }
  | { type: "comment:created"; formId: string; comment: unknown }
  | { type: "comment:updated"; formId: string; comment: unknown }
  | { type: "comment:deleted"; formId: string; commentId: string }
  | { type: "form:updated"; formId: string; form: FormEditorState }
  | { type: "presence:join"; formId: string; user: PresenceUser }
  | { type: "presence:leave"; formId: string; userId: string }
  | { type: "selection:change"; formId: string; user: PresenceUser; fieldKey: string | null }
  | {
      type: "cursor:move";
      formId: string;
      user: PresenceUser;
      view: string;
      anchor: string | null;
      x: number;
      y: number;
      hidden: boolean;
    };

/** Sous-ensemble du serveur Bun dont dépend la diffusion. */
export interface RealtimePublisher {
  publish(topic: string, data: string): unknown;
}

export const responsesTopic = (formId: string) => `form:${formId}:responses`;
export const commentsTopic = (formId: string) => `form:${formId}:comments`;
export const presenceTopic = (formId: string) => `form:${formId}:presence`;
export const editorTopic = (formId: string) => `form:${formId}:editor`;

/** Colonnes du formulaire que l'éditeur et l'onglet Paramètres modifient. */
const EDITOR_COLUMNS = [
  "slug",
  "title",
  "description",
  "schema",
  "metaColumns",
  "requireConsent",
  "consentText",
  "privacyPolicyUrl",
  "isAnonymized",
  "encryptResponses",
  "isPublished",
  "visibility",
  "allowedEmails",
  "notifyOwner",
  "sendConfirmationEmail",
  "confirmationEmailText",
  "webhookUrl",
  "startsAt",
  "endsAt",
  "maxResponses",
  "translations",
  "embedEnabled",
  "embedOrigins",
  "updatedAt",
] as const;

export type FormEditorState = Partial<Record<(typeof EDITOR_COLUMNS)[number], unknown>>;

/**
 * État éditable d'un formulaire, diffusé aux collaborateurs après chaque
 * enregistrement. Liste blanche : l'identité visuelle des exports (logo en
 * data URL, plusieurs centaines de Ko) et les compteurs internes n'ont rien à
 * faire dans chaque message.
 */
export function editorStateOf(form: Record<string, unknown>): FormEditorState {
  const state: FormEditorState = {};
  for (const column of EDITOR_COLUMNS) if (column in form) state[column] = form[column];
  return state;
}

/** Diffuse le nouvel état d'un formulaire à ceux qui l'ont ouvert. */
export function broadcastFormUpdate(form: Record<string, unknown> & { id: string }): void {
  broadcast(editorTopic(form.id), { type: "form:updated", formId: form.id, form: editorStateOf(form) });
}

let publisher: RealtimePublisher | null = null;

/** Appelé une fois l'API démarrée, avec le serveur qui porte les sockets. */
export function bindRealtime(server: RealtimePublisher | null): void {
  publisher = server;
}

/** Diffuse un évènement aux abonnés d'un topic. */
export function broadcast(topic: string, event: RealtimeEvent): void {
  publisher?.publish(topic, JSON.stringify(event));
}
