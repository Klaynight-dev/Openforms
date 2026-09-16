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
  | { type: "presence:join"; formId: string; user: PresenceUser }
  | { type: "presence:leave"; formId: string; userId: string };

/** Sous-ensemble du serveur Bun dont dépend la diffusion. */
export interface RealtimePublisher {
  publish(topic: string, data: string): unknown;
}

export const responsesTopic = (formId: string) => `form:${formId}:responses`;
export const commentsTopic = (formId: string) => `form:${formId}:comments`;
export const presenceTopic = (formId: string) => `form:${formId}:presence`;

let publisher: RealtimePublisher | null = null;

/** Appelé une fois l'API démarrée, avec le serveur qui porte les sockets. */
export function bindRealtime(server: RealtimePublisher | null): void {
  publisher = server;
}

/** Diffuse un évènement aux abonnés d'un topic. */
export function broadcast(topic: string, event: RealtimeEvent): void {
  publisher?.publish(topic, JSON.stringify(event));
}
