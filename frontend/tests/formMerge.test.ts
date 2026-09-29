import { describe, expect, test } from "bun:test";
import {
  applyLiveEdit,
  applyLiveFields,
  diffEditorContent,
  mergeValue,
  patchInPlace,
  planFieldMerge,
  rebaseEditorContent,
  sameValue,
} from "../src/lib/formMerge.ts";

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

describe("modifications en direct", () => {
  const state = (fields: F[], settings: Record<string, unknown> = { title: "T" }) => ({
    fields,
    metaColumns: [] as unknown[],
    settings,
  });

  test("n'envoie que la question modifiée", () => {
    const edit = diffEditorContent(state([f("q1"), f("q2")]), state([f("q1"), f("q2", "Bonjour")]));
    expect(edit).toEqual({ fields: [f("q2", "Bonjour")] });
  });

  test("n'envoie rien quand rien n'a changé", () => {
    expect(diffEditorContent(state([f("q1")]), state([f("q1")]))).toBeNull();
  });

  test("envoie l'ordre et la nouvelle question à l'ajout", () => {
    const edit = diffEditorContent(state([f("q1")]), state([f("q1"), f("q2")]));
    expect(edit).toEqual({ fields: [f("q2")], order: ["q1", "q2"] });
  });

  test("n'envoie que les réglages touchés", () => {
    const edit = diffEditorContent(state([], { title: "A", description: "d" }), state([], { title: "B", description: "d" }));
    expect(edit).toEqual({ settings: { title: "B" } });
  });

  test("met à jour la question reçue sans remplacer l'objet", () => {
    const q2 = f("q2");
    const fields = [f("q1"), q2];
    const out = applyLiveFields(fields, { fields: [f("q2", "Bonjour")] });
    expect(out).toBe(fields);
    expect(out[1]).toBe(q2);
    expect(q2.label).toBe("Bonjour");
  });

  test("insère une question ajoutée et applique une suppression", () => {
    const out = applyLiveFields([f("q1"), f("q2")], { order: ["q1", "q3"], fields: [f("q3")] });
    expect(out.map((x) => x.key)).toEqual(["q1", "q3"]);
  });

  test("garde une question ajoutée localement que l'autre ne connaît pas encore", () => {
    const out = applyLiveFields(
      [f("q1"), f("mienne")],
      { order: ["q0", "q1"], fields: [f("q0")] },
      (key) => key === "mienne",
    );
    expect(out.map((x) => x.key)).toEqual(["q0", "q1", "mienne"]);
  });

  test("appliquer la différence redonne exactement l'état de l'auteur", () => {
    const before = state([f("q1"), f("q2"), f("q3")]);
    const after = state([f("q3", "Déplacée"), f("q1"), f("q4")], { title: "Nouveau" });
    const edit = diffEditorContent(before, after)!;
    expect(applyLiveEdit(before, edit)).toEqual(after);
  });

  test("reporte le contenu reçu dans un état passé, sans y ajouter de question", () => {
    const past = state([f("q1", "ancien"), f("q2")]);
    const rebased = rebaseEditorContent(past, { fields: [f("q1", "Eux"), f("q9")], order: ["q1", "q2", "q9"] });
    expect(rebased.fields).toEqual([f("q1", "Eux"), f("q2")]);
  });
});
