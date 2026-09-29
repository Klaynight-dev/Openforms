import { describe, expect, test } from "bun:test";
import { applyOp, MAX_FIELDS, type FormContent } from "../../src/lib/formOps.ts";

const q = (key: string, label = key) => ({ key, type: "short_text" as const, label, required: false });

function content(keys: string[]): FormContent {
  return { schema: keys.map((k) => q(k)), title: "T", description: "", translations: {}, metaColumns: [] };
}

const keys = (c: FormContent) => c.schema.map((f) => f.key);

describe("applyOp", () => {
  test("modifie une question sans toucher aux autres", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "upsert", field: q("b", "Nouveau") });
    expect(c.schema).toEqual([q("a"), q("b", "Nouveau")]);
  });

  test("deux modifications de deux questions différentes se cumulent", () => {
    // Le défaut de l'ancien enregistrement : chaque éditeur renvoyait tout le
    // formulaire, et le dernier écrasait la question de l'autre.
    const c = content(["a", "b"]);
    applyOp(c, { t: "upsert", field: q("a", "par Alice") });
    applyOp(c, { t: "upsert", field: q("b", "par Bruno") });
    expect(c.schema.map((f) => f.label)).toEqual(["par Alice", "par Bruno"]);
  });

  test("insère une question nouvelle après sa voisine, ou en tête", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "upsert", field: q("x"), after: "a" });
    applyOp(c, { t: "upsert", field: q("y"), after: null });
    expect(keys(c)).toEqual(["y", "a", "x", "b"]);
  });

  test("place en fin une question dont la voisine a disparu", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "upsert", field: q("x"), after: "supprimee" });
    expect(keys(c)).toEqual(["a", "b", "x"]);
  });

  test("ignore `after` pour une question existante", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "upsert", field: q("b", "B"), after: null });
    expect(keys(c)).toEqual(["a", "b"]);
  });

  test("supprime, y compris deux fois (renvoi après coupure)", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "remove", key: "a" });
    applyOp(c, { t: "remove", key: "a" });
    expect(keys(c)).toEqual(["b"]);
  });

  test("déplace après une voisine ou en tête", () => {
    const c = content(["a", "b", "c"]);
    applyOp(c, { t: "move", key: "a", after: "c" });
    expect(keys(c)).toEqual(["b", "c", "a"]);
    applyOp(c, { t: "move", key: "a", after: null });
    expect(keys(c)).toEqual(["a", "b", "c"]);
  });

  test("ne déplace pas vers une voisine inconnue", () => {
    const c = content(["a", "b"]);
    applyOp(c, { t: "move", key: "a", after: "inconnue" });
    expect(keys(c)).toEqual(["a", "b"]);
  });

  test("refuse une question invalide sans rien modifier", () => {
    const c = content(["a"]);
    expect(applyOp(c, { t: "upsert", field: { key: "b", type: "inexistant", label: "x", required: false } })).toBeNull();
    expect(applyOp(c, { t: "upsert", field: { key: "clé invalide", type: "short_text", label: "x", required: false } })).toBeNull();
    expect(keys(c)).toEqual(["a"]);
  });

  test("retire les propriétés inconnues d'une question", () => {
    const c = content([]);
    const applied = applyOp(c, { t: "upsert", field: { ...q("a"), intrus: true } });
    expect(c.schema[0]).toEqual(q("a"));
    expect(applied).toEqual({ t: "upsert", field: q("a") });
  });

  test("refuse d'ajouter au-delà du maximum de questions", () => {
    const c = content(Array.from({ length: MAX_FIELDS }, (_, i) => `q${i}`));
    expect(applyOp(c, { t: "upsert", field: q("encore") })).toBeNull();
  });

  test("ne modifie que les réglages présents", () => {
    const c = content([]);
    c.description = "garde";
    applyOp(c, { t: "meta", title: "Nouveau" });
    expect(c.title).toBe("Nouveau");
    expect(c.description).toBe("garde");
  });

  test("remplace les colonnes du tableur si elles sont valides", () => {
    const c = content([]);
    applyOp(c, { t: "metaColumns", metaColumns: [{ key: "statut", label: "Statut", kind: "text" }] });
    expect(c.metaColumns).toEqual([{ key: "statut", label: "Statut", kind: "text" }]);
    expect(applyOp(c, { t: "metaColumns", metaColumns: [{ key: "x" }] })).toBeNull();
  });
});
