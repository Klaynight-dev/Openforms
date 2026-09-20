/**
 * Clés de champ.
 *
 * La clé nomme la colonne dans les exports, dans les formules du tableur et
 * dans toute intégration qui relit les réponses. Elle était engendrée à partir
 * de l'horodatage : lisible par personne, rapprochable de rien. Ces tests
 * fixent les deux garanties dont dépend le reste : une clé se lit, et deux
 * champs n'en partagent jamais une.
 */
import { describe, expect, test } from "bun:test";
import { newField, toFieldKey, uniqueFieldKey } from "../src/lib/fieldTypes.ts";

describe("toFieldKey", () => {
  test("dérive une clé lisible d'un libellé accentué et ponctué", () => {
    expect(toFieldKey("Quelle est votre priorité ?")).toBe("quelle_est_votre_priorite");
  });

  test("respecte le format accepté par l'API", () => {
    // `FieldDefinitionSchema` impose ^[a-zA-Z0-9_]{1,64}$.
    const key = toFieldKey("  Où êtes-vous allé·e, en 2026 (déjà) ?!  ");

    expect(key).toMatch(/^[a-z0-9_]{1,64}$/);
  });

  test("tronque sans laisser de séparateur en fin de clé", () => {
    const key = toFieldKey(`${"a".repeat(63)} suite`);

    expect(key.length).toBeLessThanOrEqual(64);
    expect(key.endsWith("_")).toBe(false);
  });

  test("retombe sur un nom générique quand le libellé ne donne rien", () => {
    expect(toFieldKey("???")).toBe("champ");
    expect(toFieldKey("")).toBe("champ");
  });
});

describe("uniqueFieldKey", () => {
  test("laisse la clé intacte quand elle est libre", () => {
    expect(uniqueFieldKey("priorite", ["age", "commune"])).toBe("priorite");
  });

  test("suffixe jusqu'à trouver une place", () => {
    expect(uniqueFieldKey("priorite", ["priorite"])).toBe("priorite_2");
    expect(uniqueFieldKey("priorite", ["priorite", "priorite_2"])).toBe("priorite_3");
  });

  test("reste dans la longueur maximale en suffixant", () => {
    const base = "a".repeat(64);

    expect(uniqueFieldKey(base, [base]).length).toBeLessThanOrEqual(64);
  });
});

describe("newField", () => {
  test("nomme le champ d'après son libellé, sans heurter l'existant", () => {
    const first = newField("short_text", []);
    const second = newField("short_text", [first.key]);

    expect(first.key).toBe("texte_court");
    expect(second.key).toBe("texte_court_2");
  });
});
