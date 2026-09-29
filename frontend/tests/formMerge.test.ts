import { describe, expect, test } from "bun:test";
import { mergeValue, patchInPlace, planFieldMerge, sameValue } from "../src/lib/formMerge.ts";

type F = { key: string; label: string };
const f = (key: string, label = key): F => ({ key, label });

describe("sameValue", () => {
  test("ignore l'ordre des propriétés", () => {
    expect(sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  test("distingue l'ordre des éléments d'une liste", () => {
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });
});

describe("mergeValue", () => {
  test("prend la valeur distante si la locale n'a pas bougé", () => {
    expect(mergeValue("a", "a", "b")).toBe("b");
  });

  test("garde la valeur locale modifiée", () => {
    expect(mergeValue("a", "c", "b")).toBe("c");
  });
});

describe("planFieldMerge", () => {
  const base = [f("q1"), f("q2"), f("q3")];

  test("reçoit la modification d'une question que l'on ne touche pas", () => {
    const plan = planFieldMerge(base, base, [f("q1"), f("q2", "Nouveau"), f("q3")]);
    expect(plan.order).toEqual(["q1", "q2", "q3"]);
    expect([...plan.takeRemote].sort()).toEqual(["q1", "q2", "q3"]);
  });

  test("garde la question en cours de modification et reçoit les autres", () => {
    const local = [f("q1", "Moi"), f("q2"), f("q3")];
    const remote = [f("q1"), f("q2", "Eux"), f("q3")];
    const plan = planFieldMerge(base, local, remote);
    expect(plan.takeRemote.has("q1")).toBe(false);
    expect(plan.takeRemote.has("q2")).toBe(true);
  });

  test("insère une question ajoutée à distance à sa place", () => {
    const plan = planFieldMerge(base, base, [f("q1"), f("nouvelle"), f("q2"), f("q3")]);
    expect(plan.order).toEqual(["q1", "nouvelle", "q2", "q3"]);
    expect(plan.takeRemote.has("nouvelle")).toBe(true);
  });

  test("combine un ajout local et un ajout distant", () => {
    const local = [f("q1"), f("q2"), f("q3"), f("mienne")];
    const remote = [f("q0"), f("q1"), f("q2"), f("q3")];
    expect(planFieldMerge(base, local, remote).order).toEqual(["q0", "q1", "q2", "q3", "mienne"]);
  });

  test("applique une suppression distante d'une question intacte", () => {
    expect(planFieldMerge(base, base, [f("q1"), f("q3")]).order).toEqual(["q1", "q3"]);
  });

  test("garde une question supprimée à distance si on la modifiait", () => {
    const local = [f("q1"), f("q2", "Moi"), f("q3")];
    expect(planFieldMerge(base, local, [f("q1"), f("q3")]).order).toEqual(["q1", "q2", "q3"]);
  });

  test("ne ressuscite pas une question supprimée localement", () => {
    const local = [f("q1"), f("q3")];
    expect(planFieldMerge(base, local, [f("q1"), f("q2", "Eux"), f("q3")]).order).toEqual(["q1", "q3"]);
  });

  test("suit le nouvel ordre distant si l'on n'a rien déplacé", () => {
    expect(planFieldMerge(base, base, [f("q3"), f("q1"), f("q2")]).order).toEqual(["q3", "q1", "q2"]);
  });

  test("garde son propre déplacement", () => {
    const local = [f("q2"), f("q1"), f("q3")];
    expect(planFieldMerge(base, local, [f("q1"), f("q2"), f("q3", "Eux")]).order).toEqual(["q2", "q1", "q3"]);
  });

  test("ne change rien quand le serveur renvoie l'état local (écho de son propre envoi)", () => {
    const local = [f("q1", "Moi"), f("q2"), f("q3")];
    const plan = planFieldMerge(local, local, local);
    expect(plan.order).toEqual(["q1", "q2", "q3"]);
  });
});

describe("patchInPlace", () => {
  test("met à jour l'objet sans le remplacer", () => {
    const target: Record<string, unknown> = { key: "q1", label: "Avant", required: true };
    const before = target;
    patchInPlace(target, { key: "q1", label: "Après", options: [{ value: "a", label: "A" }] });
    expect(target).toBe(before);
    expect(target).toEqual({ key: "q1", label: "Après", options: [{ value: "a", label: "A" }] });
  });
});
