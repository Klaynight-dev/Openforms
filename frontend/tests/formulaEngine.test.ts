import { describe, expect, test } from "bun:test";
import { evaluateAggregate, evaluateRowFormula, type Row } from "../src/lib/formulaEngine.ts";

const rows: Row[] = [
  { note: 10, age: "30", nom: "Ada" },
  { note: 20, age: "40", nom: "Alan" },
  { note: 30, age: "non renseigné", nom: "Grace" },
  { note: "", age: "50", nom: "Edsger" },
];

describe("evaluateAggregate", () => {
  test("calcule les agrégations usuelles en ignorant les valeurs non numériques", () => {
    expect(evaluateAggregate("SUM(note)", rows)).toBe("60");
    expect(evaluateAggregate("COUNT(note)", rows)).toBe("3");
    expect(evaluateAggregate("MIN(note)", rows)).toBe("10");
    expect(evaluateAggregate("MAX(note)", rows)).toBe("30");
    expect(evaluateAggregate("AVG(note)", rows)).toBe("20");
  });

  test("calcule la médiane sur un nombre pair et impair de valeurs", () => {
    expect(evaluateAggregate("MEDIAN(note)", rows)).toBe("20");
    expect(evaluateAggregate("MEDIAN(note)", [{ note: 1 }, { note: 4 }])).toBe("2.50");
  });

  test("est insensible à la casse du nom de fonction", () => {
    expect(evaluateAggregate("sum(note)", rows)).toBe("60");
  });

  test("formate un résultat non entier à deux décimales", () => {
    expect(evaluateAggregate("AVG(note)", [{ note: 1 }, { note: 2 }])).toBe("1.50");
  });

  test("renvoie 0 sur une colonne sans aucune valeur numérique", () => {
    expect(evaluateAggregate("SUM(inconnue)", rows)).toBe("0");
    expect(evaluateAggregate("AVG(inconnue)", rows)).toBe("0");
  });

  test("signale une fonction inconnue et ignore une formule malformée", () => {
    expect(evaluateAggregate("TOTAL(note)", rows)).toBe("#FN?");
    expect(evaluateAggregate("pas une formule", rows)).toBe("");
  });
});

describe("evaluateRowFormula — arithmétique", () => {
  const row: Row = { a: 10, b: 4, texte: "abc" };

  test("respecte la priorité des opérateurs et les parenthèses", () => {
    expect(evaluateRowFormula("=a + b * 2", row)).toBe("18");
    expect(evaluateRowFormula("=(a + b) * 2", row)).toBe("28");
  });

  test("accepte les quatre opérations et la négation unaire", () => {
    expect(evaluateRowFormula("=a - b", row)).toBe("6");
    expect(evaluateRowFormula("=a / b", row)).toBe("2.5");
    expect(evaluateRowFormula("=-a + 15", row)).toBe("5");
  });

  test("fonctionne avec ou sans le signe = initial", () => {
    expect(evaluateRowFormula("a * 2", row)).toBe("20");
    expect(evaluateRowFormula("=a * 2", row)).toBe("20");
  });

  test("traite une référence inconnue ou non numérique comme zéro", () => {
    expect(evaluateRowFormula("=inconnue + 5", row)).toBe("5");
    expect(evaluateRowFormula("=texte + 5", row)).toBe("5");
  });

  test("arrondit pour absorber les erreurs de virgule flottante", () => {
    expect(evaluateRowFormula("=0.1 + 0.2", {})).toBe("0.3");
  });

  test("renvoie #ERR plutôt que Infinity ou NaN", () => {
    expect(evaluateRowFormula("=a / 0", row)).toBe("#ERR");
    expect(evaluateRowFormula("=", row)).toBe("#ERR");
    expect(evaluateRowFormula("=a +", row)).toBe("#ERR");
  });

  test("n'évalue pas de code arbitraire", () => {
    // Aucun eval : un appel de fonction n'est pas exécuté, il se dégrade en #ERR.
    expect(evaluateRowFormula("=process.exit(1)", row)).toBe("#ERR");
  });
});

describe("evaluateRowFormula — CONCAT", () => {
  const row: Row = { prenom: "Ada", nom: "Lovelace", vide: null };

  test("concatène des références de colonne et des littéraux", () => {
    expect(evaluateRowFormula('CONCAT(prenom, " ", nom)', row)).toBe("Ada Lovelace");
  });

  test("rend une valeur absente comme chaîne vide", () => {
    expect(evaluateRowFormula("CONCAT(prenom, vide, inconnue)", row)).toBe("Ada");
  });

  test("préserve une virgule contenue dans un littéral", () => {
    expect(evaluateRowFormula('CONCAT(nom, ", ", prenom)', row)).toBe("Lovelace, Ada");
  });

  test("est insensible à la casse du nom de fonction", () => {
    expect(evaluateRowFormula("concat(prenom, nom)", row)).toBe("AdaLovelace");
  });
});
