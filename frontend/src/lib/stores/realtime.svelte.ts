/**
 * Client temps réel : une seule socket pour toute l'application, des
 * abonnements par topic et une reconnexion automatique qui rejoue les
 * abonnements en cours.
 *
 * L'authentification repose sur le cookie de session envoyé avec le handshake :
 * aucun jeton ne transite par l'URL, et le serveur filtre les topics selon les
 * droits réels sur chaque formulaire.
 */
import { browser } from "$app/environment";
import { api } from "../api/client.ts";
import type { FormComment, ResponseRow } from "../types.ts";

export interface PresenceUser {
  id: string;
  name: string;
}

export type RealtimeEvent =
  | { type: "response:created"; formId: string; row: ResponseRow }
  | {
      type: "response:updated";
      formId: string;
      responseId: string;
      target: "field" | "meta";
      key: string;
      value: unknown;
    }
  | { type: "response:deleted"; formId: string; responseId: string }
  | { type: "comment:created"; formId: string; comment: FormComment }
  | { type: "comment:updated"; formId: string; comment: FormComment }
  | { type: "comment:deleted"; formId: string; commentId: string }
  | { type: "presence:sync"; formId: string; users: PresenceUser[] }
  | { type: "presence:join"; formId: string; user: PresenceUser }
  | { type: "presence:leave"; formId: string; userId: string };

export const responsesTopic = (formId: string) => `form:${formId}:responses`;
export const commentsTopic = (formId: string) => `form:${formId}:comments`;
export const presenceTopic = (formId: string) => `form:${formId}:presence`;

/** Le topic n'est pas renvoyé par le serveur : on le reconstruit depuis l'évènement. */
function topicOf(event: { type?: string; formId?: string }): string | null {
  if (typeof event.type !== "string" || typeof event.formId !== "string") return null;
  if (event.type.startsWith("response:")) return responsesTopic(event.formId);
  if (event.type.startsWith("comment:")) return commentsTopic(event.formId);
  if (event.type.startsWith("presence:")) return presenceTopic(event.formId);
  return null;
}

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;
/** Au-delà, on considère que la session est perdue et on cesse de réessayer. */
const MAX_ATTEMPTS = 8;

interface Subscription {
  topics: string[];
  handler: (event: RealtimeEvent) => void;
}

class RealtimeClient {
  /** Vrai tant que la socket est ouverte : pilote l'indicateur « en direct ». */
  connected = $state(false);

  private socket: WebSocket | null = null;
  private subscriptions = new Set<Subscription>();
  private topicCounts = new Map<string, number>();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Abonne un consommateur à des topics et renvoie sa fonction de résiliation.
   * Les topics sont comptés : le serveur n'est sollicité qu'au premier abonné
   * et au dernier partant.
   */
  subscribe(topics: string[], handler: (event: RealtimeEvent) => void): () => void {
    if (!browser || topics.length === 0) return () => {};

    const subscription: Subscription = { topics, handler };
    this.subscriptions.add(subscription);

    const added = topics.filter((topic) => {
      const count = this.topicCounts.get(topic) ?? 0;
      this.topicCounts.set(topic, count + 1);
      return count === 0;
    });

    this.connect();
    if (added.length) this.send({ type: "subscribe", topics: added });

    return () => {
      if (!this.subscriptions.delete(subscription)) return;
      const removed = topics.filter((topic) => {
        const count = (this.topicCounts.get(topic) ?? 1) - 1;
        if (count > 0) {
          this.topicCounts.set(topic, count);
          return false;
        }
        this.topicCounts.delete(topic);
        return true;
      });
      if (removed.length) this.send({ type: "unsubscribe", topics: removed });
      if (this.topicCounts.size === 0) this.disconnect();
    };
  }

  private connect(): void {
    if (this.socket) return;

    // `VITE_API_BASE` est vide en déploiement same-origin (routage par chemin) :
    // la socket suit alors le domaine visité, comme les appels REST.
    const base = api.base || window.location.origin;
    const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/v1/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.connected = true;
      const topics = [...this.topicCounts.keys()];
      if (topics.length) this.send({ type: "subscribe", topics });
      this.heartbeatTimer = setInterval(() => this.send({ type: "ping" }), HEARTBEAT_MS);
    };

    socket.onmessage = (event) => this.dispatch(String(event.data));
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      this.clearTimers();
      this.socket = null;
      this.connected = false;
      if (this.topicCounts.size > 0) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.attempt >= MAX_ATTEMPTS) return;
    const delay = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private disconnect(): void {
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    socket?.close();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  private send(message: { type: string; topics?: string[] }): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private dispatch(raw: string): void {
    let message: { type?: string; formId?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    const topic = topicOf(message);
    if (!topic) return;

    for (const subscription of this.subscriptions) {
      if (subscription.topics.includes(topic)) {
        subscription.handler(message as RealtimeEvent);
      }
    }
  }
}

export const realtime = new RealtimeClient();
