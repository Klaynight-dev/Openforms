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
import type { FieldDefinition, FormComment, FormDetail, ResponseRow } from "../types.ts";
import type { LiveEdit } from "../formMerge.ts";

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
  | { type: "form:updated"; formId: string; form: Partial<FormDetail> }
  | { type: "form:live"; formId: string; user: PresenceUser; edit: LiveEdit<FieldDefinition> }
  | { type: "presence:sync"; formId: string; users: PresenceUser[] }
  | { type: "presence:join"; formId: string; user: PresenceUser }
  | { type: "presence:leave"; formId: string; userId: string }
  | { type: "selection:sync"; formId: string; selections: { user: PresenceUser; fieldKey: string }[] }
  | { type: "selection:change"; formId: string; user: PresenceUser; fieldKey: string | null }
  | ({ type: "cursor:move"; formId: string; user: PresenceUser } & Required<CursorPosition>);

/** Position du pointeur partagée avec les autres personnes sur le formulaire. */
export interface CursorPosition {
  /** Onglet affiché (questions, réponses…) : un pointeur n'a de sens que là. */
  view: string;
  /** Élément `data-cursor-anchor` survolé, ou `null` pour la zone de contenu. */
  anchor: string | null;
  x: number;
  y: number;
  /** Vrai quand le pointeur quitte la page. */
  hidden?: boolean;
}

export const responsesTopic = (formId: string) => `form:${formId}:responses`;
export const commentsTopic = (formId: string) => `form:${formId}:comments`;
export const presenceTopic = (formId: string) => `form:${formId}:presence`;
/** Nouvel état du formulaire, diffusé après chaque enregistrement. */
export const editorTopic = (formId: string) => `form:${formId}:editor`;

/** Le topic n'est pas renvoyé par le serveur : on le reconstruit depuis l'évènement. */
function topicOf(event: { type?: string; formId?: string }): string | null {
  if (typeof event.type !== "string" || typeof event.formId !== "string") return null;
  if (event.type.startsWith("response:")) return responsesTopic(event.formId);
  if (event.type.startsWith("comment:")) return commentsTopic(event.formId);
  if (event.type.startsWith("form:")) return editorTopic(event.formId);
  if (
    event.type.startsWith("presence:") ||
    event.type.startsWith("cursor:") ||
    event.type.startsWith("selection:")
  ) {
    return presenceTopic(event.formId);
  }
  return null;
}

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
/**
 * Délai avant de fermer une socket qui n'a plus d'abonné. Une navigation ou un
 * effet Svelte qui se relance se désabonne puis se réabonne aussitôt : fermer
 * tout de suite coupait une socket encore en cours d'ouverture (« connexion
 * interrompue pendant le chargement de la page ») pour en rouvrir une autre.
 */
const IDLE_CLOSE_MS = 2_000;

interface Subscription {
  topics: string[];
  handler: (event: RealtimeEvent) => void;
}

type OutgoingMessage =
  | { type: "subscribe" | "unsubscribe"; topics: string[] }
  | { type: "ping" }
  | ({ type: "cursor"; formId: string } & CursorPosition)
  | { type: "select"; formId: string; fieldKey: string | null }
  | { type: "edit"; formId: string; edit: LiveEdit<FieldDefinition> };

class RealtimeClient {
  /** Vrai tant que la socket est ouverte : pilote l'indicateur « en direct ». */
  connected = $state(false);

  private socket: WebSocket | null = null;
  private subscriptions = new Set<Subscription>();
  private topicCounts = new Map<string, number>();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

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

    this.cancelIdleClose();
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
      if (this.topicCounts.size === 0) this.scheduleIdleClose();
    };
  }

  /** Diffuse la position du pointeur aux autres personnes sur ce formulaire. */
  sendCursor(formId: string, cursor: CursorPosition): void {
    this.send({ type: "cursor", formId, ...cursor });
  }

  /** Montre aux autres personnes la question sélectionnée (`null` : aucune). */
  sendSelection(formId: string, fieldKey: string | null): void {
    this.send({ type: "select", formId, fieldKey });
  }

  /**
   * Diffuse une modification de l'éditeur en cours de frappe. Rien n'est
   * enregistré par ce biais : l'enregistrement reste celui de l'auteur.
   */
  sendEdit(formId: string, edit: LiveEdit<FieldDefinition>): void {
    this.send({ type: "edit", formId, edit });
  }

  private connect(): void {
    if (this.socket) return;
    this.listenToEnvironment();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    // `VITE_API_BASE` est vide en déploiement same-origin (routage par chemin) :
    // la socket suit alors le domaine visité, comme les appels REST.
    const base = api.base || window.location.origin;
    const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/v1/ws`);
    this.socket = socket;

    // Chaque gestionnaire vérifie qu'il appartient encore à la socket
    // courante : le `close` tardif d'une ancienne socket ne doit ni couper les
    // minuteries de la nouvelle, ni l'oublier en remettant `socket` à null.
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.connected = true;
      const topics = [...this.topicCounts.keys()];
      if (topics.length) this.send({ type: "subscribe", topics });
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => this.send({ type: "ping" }), HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      if (this.socket === socket) this.dispatch(String(event.data));
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.connected = false;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.topicCounts.size > 0) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Hors ligne ou onglet masqué, inutile d'insister : `online` et
    // `visibilitychange` relancent la connexion au bon moment.
    if (!navigator.onLine || document.visibilityState === "hidden") return;
    const ceiling = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Reprend la connexion dès que le réseau ou l'onglet redevient disponible. */
  private listenToEnvironment(): void {
    if (this.listening) return;
    this.listening = true;
    const resume = () => {
      if (this.socket || this.topicCounts.size === 0) return;
      if (document.visibilityState === "hidden") return;
      this.attempt = 0;
      this.connect();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
  }

  private scheduleIdleClose(): void {
    this.cancelIdleClose();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.topicCounts.size === 0) this.disconnect();
    }, IDLE_CLOSE_MS);
  }

  private cancelIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private disconnect(): void {
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    if (!socket) return;
    if (socket.readyState === WebSocket.CONNECTING) {
      // Fermer une socket en cours d'ouverture fait râler le navigateur :
      // on la laisse aboutir puis on la ferme proprement.
      socket.onopen = () => socket.close();
    } else {
      socket.close();
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.cancelIdleClose();
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  private send(message: OutgoingMessage): void {
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
