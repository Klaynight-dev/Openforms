import type { ResponseRow } from "./types.ts";

/**
 * Applique une synchro incrémentale aux lignes en cache : les lignes reçues
 * remplacent ou complètent les anciennes, celles absentes de `ids` ont été
 * supprimées. Le résultat suit l'ordre de l'API (plus récentes d'abord).
 */
export function mergeResponseRows(cached: ResponseRow[], changed: ResponseRow[], ids: string[]): ResponseRow[] {
  const alive = new Set(ids);
  const byId = new Map<string, ResponseRow>();
  for (const row of cached) if (alive.has(row.id)) byId.set(row.id, row);
  for (const row of changed) if (alive.has(row.id)) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) =>
    a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0,
  );
}

/**
 * Activité des 30 derniers jours (jour UTC → nombre de réponses), calculée à
 * partir des lignes déjà chargées plutôt que redemandée à l'API. Même découpage
 * que GET /stats/form/:id/summary.
 */
export function activityFromRows(rows: ResponseRow[], now = new Date()): { date: string; count: number }[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const counts = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = new Date(row.submittedAt).toISOString().slice(0, 10);
    const count = counts.get(key);
    if (count !== undefined) counts.set(key, count + 1);
  }
  return [...counts].map(([date, count]) => ({ date, count }));
}
