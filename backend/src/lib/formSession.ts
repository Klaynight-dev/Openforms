import { prisma } from "../services/prisma.ts";
import { recordFormVersion } from "./formVersion.ts";
import { applyOp, type FormContent, type FormOp } from "./formOps.ts";
import type { FieldDefinition, MetaColumn } from "./formSchema.ts";

/**
 * Session d'édition collaborative d'un formulaire.
 *
 * Tant que quelqu'un édite, l'état du formulaire vit ici, en mémoire, et
 * c'est lui qui fait autorité : chaque lot d'opérations y est appliqué dans
 * l'ordre d'arrivée et reçoit un numéro de révision. Les éditeurs suivent ce
 * numéro ; un trou dans la suite leur dit qu'ils ont manqué quelque chose et
 * qu'ils doivent se resynchroniser.
 *
 * L'écriture en base est différée de quelques centaines de millisecondes :
 * une frappe par requête SQL serait hors de prix. Toute lecture ou écriture
 * REST du formulaire passe d'abord par `flushSession`, pour ne jamais lire ni
 * écraser un état antérieur à ce que les éditeurs voient.
 *
 * Un seul processus API est supposé, comme pour la présence (ws.controller).
 */

/** Délai d'inactivité avant l'écriture en base. */
const FLUSH_DELAY_MS = 400;
/** Écriture forcée pendant une saisie continue. */
const FLUSH_MAX_WAIT_MS = 2_000;
/** Une session inactive depuis ce délai est libérée (son état est en base). */
const IDLE_EVICT_MS = 10 * 60_000;

/** Titre écrit en base à la place d'un titre vidé : la colonne en exige un. */
export const UNTITLED = "Sans titre";

interface Session extends FormContent {
  rev: number;
  /** Modifications pas encore écrites en base. */
  dirty: boolean;
  dirtySince: number;
  /** Dernier auteur, pour l'historique des versions. */
  authorId: string | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Session>();
/** File d'attente par formulaire : toutes les opérations s'y exécutent l'une après l'autre. */
const queues = new Map<string, Promise<unknown>>();

function serialize<T>(formId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(formId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => {});
  queues.set(formId, settled);
  void settled.then(() => {
    if (queues.get(formId) === settled) queues.delete(formId);
  });
  return run;
}

async function load(formId: string): Promise<Session | null> {
  const existing = sessions.get(formId);
  if (existing) return existing;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { schema: true, title: true, description: true, translations: true, metaColumns: true },
  });
  if (!form) return null;
  const session: Session = {
    schema: (form.schema as unknown as FieldDefinition[]) ?? [],
    title: form.title,
    description: form.description ?? "",
    translations: form.translations ?? {},
    metaColumns: (form.metaColumns as unknown as MetaColumn[]) ?? [],
    rev: 0,
    dirty: false,
    dirtySince: 0,
    authorId: null,
    flushTimer: null,
    evictTimer: null,
  };
  sessions.set(formId, session);
  return session;
}

async function write(formId: string, session: Session): Promise<void> {
  if (session.flushTimer) clearTimeout(session.flushTimer);
  session.flushTimer = null;
  if (!session.dirty) return;
  session.dirty = false;

  const before = await prisma.form.findUnique({ where: { id: formId } });
  if (!before) {
    sessions.delete(formId);
    return;
  }
  if (session.authorId) await recordFormVersion(before, session.authorId);
  await prisma.form.update({
    where: { id: formId },
    data: {
      schema: session.schema as object,
      title: session.title.trim() || UNTITLED,
      description: session.description,
      translations: session.translations as object,
      metaColumns: session.metaColumns as object,
    },
  });
}

function scheduleWrite(formId: string, session: Session): void {
  const now = Date.now();
  if (!session.dirty) {
    session.dirty = true;
    session.dirtySince = now;
  }
  if (session.flushTimer) clearTimeout(session.flushTimer);
  const wait = Math.max(0, Math.min(FLUSH_DELAY_MS, session.dirtySince + FLUSH_MAX_WAIT_MS - now));
  session.flushTimer = setTimeout(() => {
    void flushSession(formId).catch((err) => console.error("[édition] écriture impossible :", err));
  }, wait);

  if (session.evictTimer) clearTimeout(session.evictTimer);
  session.evictTimer = setTimeout(() => {
    void serialize(formId, async () => {
      const current = sessions.get(formId);
      if (current !== session) return;
      await write(formId, session);
      sessions.delete(formId);
    }).catch(() => {});
  }, IDLE_EVICT_MS);
}

export interface AppliedBatch {
  rev: number;
  ops: FormOp[];
  /** Nombre d'opérations refusées (question invalide, formulaire plein…). */
  rejected: number;
}

/**
 * Applique un lot d'opérations et appelle `publish` avec le résultat, dans
 * la file du formulaire : les diffusions partent dans l'ordre des révisions.
 * Renvoie `null` si le formulaire n'existe pas.
 */
export function applyOps(
  formId: string,
  authorId: string,
  ops: FormOp[],
  publish: (batch: AppliedBatch) => void,
): Promise<AppliedBatch | null> {
  return serialize(formId, async () => {
    const session = await load(formId);
    if (!session) return null;
    const applied: FormOp[] = [];
    for (const op of ops) {
      const result = applyOp(session, op);
      if (result) applied.push(result);
    }
    if (applied.length > 0) {
      session.rev += 1;
      session.authorId = authorId;
      scheduleWrite(formId, session);
    }
    const batch: AppliedBatch = { rev: session.rev, ops: applied, rejected: ops.length - applied.length };
    publish(batch);
    return batch;
  });
}

/** Écrit en base les modifications en attente. */
export function flushSession(formId: string): Promise<void> {
  return serialize(formId, async () => {
    const session = sessions.get(formId);
    if (session) await write(formId, session);
  });
}

/**
 * Écrit puis oublie la session : à appeler avant qu'une écriture REST ne
 * remplace le contenu (restauration d'une version, API). Les éditeurs sont
 * prévenus séparément et se resynchronisent.
 */
export function dropSession(formId: string): Promise<void> {
  return serialize(formId, async () => {
    const session = sessions.get(formId);
    if (!session) return;
    await write(formId, session);
    if (session.evictTimer) clearTimeout(session.evictTimer);
    sessions.delete(formId);
  });
}

/**
 * État courant et révision, pour un éditeur qui (ré)ouvre le formulaire.
 * Sans session, la révision est 0 : le premier lot reçu sera le n° 1.
 */
export function readSession(formId: string): Promise<(FormContent & { rev: number }) | null> {
  return serialize(formId, async () => {
    const session = sessions.get(formId);
    if (!session) return null;
    const { schema, title, description, translations, metaColumns, rev } = session;
    return structuredClone({ schema, title, description, translations, metaColumns, rev });
  });
}
