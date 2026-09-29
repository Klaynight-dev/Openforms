import { describe, expect, test } from "bun:test";
import {
  applyOpsToContent,
  applyOpsToFields,
  diffToOps,
  patchInPlace,
  rebaseContent,
  sameValue,
  touchedKeys,
  withoutKeys,
  type EditorContent,
} from "../src/lib/formOps.ts";
import type { FieldDefinition } from "../src/lib/types.ts";

const q = (key: string, label = key): FieldDefinition => ({ key, type: "short_text", label, required: false });
const content = (fields: FieldDefinition[], settings: Record<string, unknown> = { title: "T" }): EditorContent => ({
  fields,
  settings,
});
const keys = (c: EditorContent) => c.fields.map((f) => f.key);

describe("diffToOps", () => {
  test("rien à envoyer quand rien n'a changé", () => {
    expect(diffToOps(content([q("a")]), content([q("a")]))).toEqual([]);
  });

  test("n'envoie que la question modifiée", () => {
    expect(diffToOps(content([q("a"), q("b")]), content([q("a"), q("b", "B")]))).toEqual([
      { t: "upsert", field: q("b", "B") },
    ]);
  });

  test("place une question ajoutée après sa voisine", () => {
    expect(diffToOps(content([q("a"), q("b")]), content([q("a"), q("x"), q("b")]))).toEqual([
      { t: "upsert", field: q("x"), after: "a" },
    ]);
  });

  test("envoie la suppression et le titre", () => {
    expect(diffToOps(content([q("a"), q("b")]), content([q("b")], { title: "Nouveau" }))).toEqual([
      { t: "meta", title: "Nouveau" },
      { t: "remove", key: "a" },
    ]);
  });

  test("un déplacement ne produit qu'une opération", () => {
    const ops = diffToOps(content([q("a"), q("b"), q("c")]), content([q("c"), q("a"), q("b")]));
    expect(ops).toEqual([{ t: "move", key: "c", after: null }]);
  });

  test("appliquer les opérations redonne l'état local, quel que soit le mélange", () => {
    const cases: [string[], string[]][] = [
      [["a", "b", "c", "d"], ["d", "c", "b", "a"]],
      [["a", "b", "c"], ["x", "c", "y", "a"]],
      [[], ["a", "b"]],
      [["a", "b"], []],
      [["a", "b", "c", "d", "e"], ["b", "e", "nouveau", "a", "d"]],
    ];
    for (const [from, to] of cases) {
      const shared = content(from.map((k) => q(k)));
      const local = content(to.map((k) => q(k, k === "a" ? "modifiée" : k)), { title: "X", description: "d" });
      const result = applyOpsToContent(shared, diffToOps(shared, local));
      expect(keys(result)).toEqual(to);
      expect(sameValue(result, local)).toBe(true);
    }
  });
});

describe("application des opérations reçues", () => {
  test("met à jour une question sans remplacer l'objet affiché", () => {
    const b = q("b");
    const out = applyOpsToFields([q("a"), b], [{ t: "upsert", field: q("b", "Bonjour") }], (current, incoming) => {
      patchInPlace(current as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>);
      return current;
    });
    expect(out[1]).toBe(b);
    expect(b.label).toBe("Bonjour");
  });

  test("met en fin une question dont la voisine a disparu, comme le serveur", () => {
    const out = applyOpsToFields([q("a")], [{ t: "upsert", field: q("x"), after: "absente" }], (c) => c);
    expect(out.map((f) => f.key)).toEqual(["a", "x"]);
  });
});

describe("modifications non encore confirmées", () => {
  test("liste ce que touchent des opérations", () => {
    const ops = [
      { t: "upsert", field: q("a") },
      { t: "move", key: "b", after: null },
      { t: "meta", title: "T" },
    ] as const;
    expect([...touchedKeys([...ops])].sort()).toEqual(["a", "b", "meta:title"]);
  });

  test("écarte les opérations reçues sur ce qu'on est en train de modifier", () => {
    const received = [
      { t: "upsert" as const, field: q("a", "eux") },
      { t: "upsert" as const, field: q("b", "eux") },
      { t: "meta" as const, title: "eux", description: "eux" },
    ];
    expect(withoutKeys(received, new Set(["a", "meta:title"]))).toEqual([
      { t: "upsert", field: q("b", "eux") },
      { t: "meta", description: "eux" },
    ]);
  });
});

describe("rebaseContent", () => {
  test("reporte le contenu reçu dans un état passé, sans y ajouter de question", () => {
    const past = content([q("a", "ancien"), q("b")]);
    const rebased = rebaseContent(past, [
      { t: "upsert", field: q("a", "eux") },
      { t: "upsert", field: q("z"), after: "b" },
    ]);
    expect(rebased.fields).toEqual([q("a", "eux"), q("b")]);
  });
});
