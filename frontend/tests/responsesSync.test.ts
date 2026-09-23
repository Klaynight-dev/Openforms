import { describe, expect, test } from "bun:test";
import { activityFromRows, mergeResponseRows } from "../src/lib/responsesSync.ts";
import type { ResponseRow } from "../src/lib/types.ts";

function row(id: string, submittedAt: string, values: Record<string, unknown> = {}): ResponseRow {
  return { id, submittedAt, updatedAt: submittedAt, values, metadata: {}, files: [] };
}

describe("mergeResponseRows", () => {
  const cached = [row("b", "2026-09-02T10:00:00Z", { q: "ancien" }), row("a", "2026-09-01T10:00:00Z")];

  test("remplace une ligne modifiée et garde les autres", () => {
    const merged = mergeResponseRows(cached, [row("b", "2026-09-02T10:00:00Z", { q: "nouveau" })], ["a", "b"]);
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
    expect(merged[0].values.q).toBe("nouveau");
  });

  test("ajoute une nouvelle ligne à sa place chronologique", () => {
    const merged = mergeResponseRows(cached, [row("c", "2026-09-03T10:00:00Z")], ["a", "b", "c"]);
    expect(merged.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  test("retire les lignes supprimées côté serveur", () => {
    const merged = mergeResponseRows(cached, [], ["a"]);
    expect(merged.map((r) => r.id)).toEqual(["a"]);
  });

  test("ignore une ligne reçue mais absente de la liste des identifiants", () => {
    const merged = mergeResponseRows(cached, [row("x", "2026-09-04T10:00:00Z")], ["a", "b"]);
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("activityFromRows", () => {
  const now = new Date("2026-09-23T15:00:00Z");

  test("couvre 30 jours, du plus ancien au jour courant", () => {
    const activity = activityFromRows([], now);
    expect(activity).toHaveLength(30);
    expect(activity[0].date).toBe("2026-08-25");
    expect(activity[29].date).toBe("2026-09-23");
  });

  test("compte les réponses par jour et ignore celles hors fenêtre", () => {
    const activity = activityFromRows(
      [
        row("1", "2026-09-23T08:00:00Z"),
        row("2", "2026-09-23T20:00:00Z"),
        row("3", "2026-08-25T00:00:00Z"),
        row("4", "2026-08-24T23:59:59Z"),
      ],
      now,
    );
    expect(activity[29].count).toBe(2);
    expect(activity[0].count).toBe(1);
    expect(activity.reduce((n, a) => n + a.count, 0)).toBe(3);
  });
});
