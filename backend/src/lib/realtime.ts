/**
 * Diffusion temps réel (WebSocket).
 *
 * Les topics sont cloisonnés par formulaire : un client ne peut s'y abonner
 * qu'avec un accès effectif sur le formulaire (voir ws.controller.ts). Les
 * contrôleurs HTTP publient via le serveur Bun exposé par le contexte Elysia
 * (`server`), qui porte le pub/sub natif des WebSockets.
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
  | { type: "comment:deleted"; formId: string; commentId: string };

/** Sous-ensemble du serveur Bun dont dépend la diffusion. */
export interface RealtimePublisher {
  publish(topic: string, data: string): unknown;
}

export const responsesTopic = (formId: string) => `form:${formId}:responses`;
export const commentsTopic = (formId: string) => `form:${formId}:comments`;
export const presenceTopic = (formId: string) => `form:${formId}:presence`;

/** Diffuse un évènement métier aux abonnés d'un topic. */
export function broadcast(
  server: RealtimePublisher | null | undefined,
  topic: string,
  event: RealtimeEvent,
): void {
  server?.publish(topic, JSON.stringify(event));
}
