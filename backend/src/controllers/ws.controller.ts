import { Elysia, t } from "elysia";
import { prisma } from "../services/prisma.ts";
import { authPlugin } from "../middleware/auth.ts";
import { isAllowedOrigin } from "../middleware/security.ts";
import { broadcast, presenceTopic, type PresenceUser, type RealtimeEvent } from "../lib/realtime.ts";
import type { SessionContext } from "../lib/session.ts";

/**
 * Canal temps réel unique (`/api/v1/ws`).
 *
 * Le client ouvre une seule socket puis s'abonne aux topics dont il a besoin :
 *   - `form:<id>:responses` : lignes du tableur (création / édition / suppression)
 *   - `form:<id>:comments`  : fil de commentaires du formulaire
 *   - `form:<id>:presence`  : qui a le formulaire ouvert en ce moment
 *
 * Chaque abonnement est vérifié contre les droits réels de l'utilisateur sur le
 * formulaire : la socket est authentifiée par le cookie de session, jamais par
 * une information fournie par le client.
 */

const TOPIC_PATTERN = /^form:([0-9a-fA-F-]{36}):(responses|comments|presence)$/;

/** Roster de présence en mémoire : formId -> userId -> nombre d'onglets ouverts. */
const presenceByForm = new Map<string, Map<string, { user: PresenceUser; sockets: number }>>();

/** Formulaires dont chaque socket annonce la présence, pour nettoyer à la fermeture. */
const presenceBySocket = new Map<string, Set<string>>();

function parseTopic(topic: string): { formId: string; channel: string } | null {
  const match = TOPIC_PATTERN.exec(topic);
  return match ? { formId: match[1]!, channel: match[2]! } : null;
}

/**
 * Filtre une liste de topics demandés pour ne garder que ceux dont
 * l'utilisateur peut réellement lire le formulaire, en une seule requête.
 */
async function authorizeTopics(user: SessionContext["user"], topics: string[]): Promise<string[]> {
  const parsed = topics
    .map((topic) => ({ topic, parsed: parseTopic(topic) }))
    .filter((entry): entry is { topic: string; parsed: { formId: string; channel: string } } =>
      entry.parsed !== null,
    );
  if (parsed.length === 0) return [];

  const formIds = [...new Set(parsed.map((entry) => entry.parsed.formId))];

  let readable: Set<string>;
  if (user.role === "SUPER_ADMIN") {
    readable = new Set(formIds);
  } else {
    const forms = await prisma.form.findMany({
      where: {
        id: { in: formIds },
        OR: [{ ownerId: user.id }, { access: { some: { userId: user.id } } }],
      },
      select: { id: true },
    });
    readable = new Set(forms.map((form) => form.id));
  }

  return parsed.filter((entry) => readable.has(entry.parsed.formId)).map((entry) => entry.topic);
}

function roster(formId: string): PresenceUser[] {
  return [...(presenceByForm.get(formId)?.values() ?? [])].map((entry) => entry.user);
}

/** Enregistre la présence ; renvoie vrai si l'utilisateur vient d'arriver. */
function joinPresence(socketId: string, formId: string, user: PresenceUser): boolean {
  const forForm = presenceByForm.get(formId) ?? new Map();
  presenceByForm.set(formId, forForm);

  const tracked = presenceBySocket.get(socketId) ?? new Set();
  presenceBySocket.set(socketId, tracked);
  if (tracked.has(formId)) return false;
  tracked.add(formId);

  const existing = forForm.get(user.id);
  if (existing) {
    existing.sockets += 1;
    return false;
  }
  forForm.set(user.id, { user, sockets: 1 });
  return true;
}

/** Retire la présence ; renvoie vrai si l'utilisateur n'a plus aucun onglet ouvert. */
function leavePresence(socketId: string, formId: string, userId: string): boolean {
  const tracked = presenceBySocket.get(socketId);
  if (!tracked?.delete(formId)) return false;

  const forForm = presenceByForm.get(formId);
  const entry = forForm?.get(userId);
  if (!forForm || !entry) return false;

  entry.sockets -= 1;
  if (entry.sockets > 0) return false;

  forForm.delete(userId);
  if (forForm.size === 0) presenceByForm.delete(formId);
  return true;
}

function publishPresence(formId: string, event: RealtimeEvent): void {
  broadcast(presenceTopic(formId), event);
}

export const wsController = new Elysia()
  .use(authPlugin)
  .ws("/api/v1/ws", {
    body: t.Object({
      type: t.Union([t.Literal("subscribe"), t.Literal("unsubscribe"), t.Literal("ping")]),
      topics: t.Optional(t.Array(t.String({ maxLength: 128 }), { maxItems: 200 })),
    }),

    beforeHandle({ auth, request, set }) {
      const origin = request.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) {
        set.status = 403;
        return { success: false, error: "Origine non autorisée." };
      }
      if (!auth) {
        set.status = 401;
        return { success: false, error: "Authentification requise." };
      }
    },

    async message(ws, message) {
      const auth = ws.data.auth as SessionContext | null;
      if (!auth) return;

      if (message.type === "ping") {
        ws.send({ type: "pong" });
        return;
      }

      const presenceUser: PresenceUser = {
        id: auth.user.id,
        name: auth.user.displayName ?? auth.user.email,
      };

      if (message.type === "subscribe") {
        const topics = await authorizeTopics(auth.user, message.topics ?? []);
        for (const topic of topics) {
          ws.subscribe(topic);
          const parsed = parseTopic(topic);
          if (parsed?.channel !== "presence") continue;
          if (joinPresence(ws.id, parsed.formId, presenceUser)) {
            publishPresence(parsed.formId, {
              type: "presence:join",
              formId: parsed.formId,
              user: presenceUser,
            });
          }
          ws.send({ type: "presence:sync", formId: parsed.formId, users: roster(parsed.formId) });
        }
        ws.send({ type: "subscribed", topics });
        return;
      }

      for (const topic of message.topics ?? []) {
        ws.unsubscribe(topic);
        const parsed = parseTopic(topic);
        if (parsed?.channel !== "presence") continue;
        if (leavePresence(ws.id, parsed.formId, auth.user.id)) {
          publishPresence(parsed.formId, {
            type: "presence:leave",
            formId: parsed.formId,
            userId: auth.user.id,
          });
        }
      }
    },

    close(ws) {
      const auth = ws.data.auth as SessionContext | null;
      for (const formId of [...(presenceBySocket.get(ws.id) ?? [])]) {
        if (auth && leavePresence(ws.id, formId, auth.user.id)) {
          publishPresence(formId, { type: "presence:leave", formId, userId: auth.user.id });
        }
      }
      presenceBySocket.delete(ws.id);
    },
  });
