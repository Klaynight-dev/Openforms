import { describe, expect, test } from "bun:test";
import {
  JUSTIFICATION_SUFFIX,
  safeRegexTest,
  validateSubmission,
  type FieldDefinition,
} from "../../src/lib/formSchema.ts";

/** Fabrique un champ minimal valide, surchargeable par test. */
function field(over: Partial<FieldDefinition> & Pick<FieldDefinition, "key" | "type">): FieldDefinition {
  return { label: over.key, required: false, ...over } as FieldDefinition;
}

describe("validateSubmission- champs requis", () => {
  test("signale un champ requis absent", () => {
    const { errors } = validateSubmission([field({ key: "nom", type: "short_text", required: true })], {});
    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe("nom");
  });

  test("traite la chaîne vide et le tableau vide comme absents", () => {
    const fields = [
      field({ key: "nom", type: "short_text", required: true }),
      field({ key: "choix", type: "checkbox", required: true, options: [{ value: "a", label: "A" }] }),
    ];
    const { errors } = validateSubmission(fields, { nom: "", choix: [] });
    expect(errors.map((e) => e.key).sort()).toEqual(["choix", "nom"]);
  });

  test("accepte un champ optionnel absent sans l'ajouter aux valeurs propres", () => {
    const { errors, clean } = validateSubmission([field({ key: "nom", type: "short_text" })], {});
    expect(errors).toHaveLength(0);
    expect(clean).not.toHaveProperty("nom");
  });

  test("ignore les clés soumises qui ne correspondent à aucun champ", () => {
    const { clean } = validateSubmission([field({ key: "nom", type: "short_text" })], {
      nom: "Ada",
      injecte: "valeur non déclarée",
    });
    expect(clean).toEqual({ nom: "Ada" });
  });
});

describe("validateSubmission- validation par type", () => {
  test("applique les longueurs min et max du texte", () => {
    const f = [field({ key: "bio", type: "paragraph", validation: { minLength: 5, maxLength: 10 } })];
    expect(validateSubmission(f, { bio: "abc" }).errors).toHaveLength(1);
    expect(validateSubmission(f, { bio: "abcdefghijk" }).errors).toHaveLength(1);
    expect(validateSubmission(f, { bio: "abcdef" }).errors).toHaveLength(0);
  });

  test("rejette un email malformé et normalise les espaces", () => {
    const f = [field({ key: "mail", type: "email" })];
    expect(validateSubmission(f, { mail: "pas-un-email" }).errors).toHaveLength(1);
    const ok = validateSubmission(f, { mail: "  ada@example.org  " });
    expect(ok.errors).toHaveLength(0);
    expect(ok.clean.mail).toBe("ada@example.org");
  });

  test("applique les bornes numériques et convertit en nombre", () => {
    const f = [field({ key: "age", type: "number", validation: { min: 18, max: 99 } })];
    expect(validateSubmission(f, { age: 17 }).errors).toHaveLength(1);
    expect(validateSubmission(f, { age: 100 }).errors).toHaveLength(1);
    const ok = validateSubmission(f, { age: "42" });
    expect(ok.errors).toHaveLength(0);
    expect(ok.clean.age).toBe(42);
  });

  test("rejette une valeur numérique non finie", () => {
    const f = [field({ key: "age", type: "number" })];
    expect(validateSubmission(f, { age: "beaucoup" }).errors).toHaveLength(1);
  });

  test("refuse un choix hors des options déclarées", () => {
    const f = [
      field({
        key: "couleur",
        type: "radio",
        options: [
          { value: "rouge", label: "Rouge" },
          { value: "bleu", label: "Bleu" },
        ],
      }),
    ];
    expect(validateSubmission(f, { couleur: "vert" }).errors).toHaveLength(1);
    expect(validateSubmission(f, { couleur: "bleu" }).errors).toHaveLength(0);
  });

  test("accepte la valeur « autre » seulement si allowOther est activé", () => {
    const options = [{ value: "rouge", label: "Rouge" }];
    const sans = [field({ key: "c", type: "radio", options })];
    const avec = [field({ key: "c", type: "radio", options, allowOther: true })];
    expect(validateSubmission(sans, { c: "__other__:vert" }).errors).toHaveLength(1);
    expect(validateSubmission(avec, { c: "__other__:vert" }).errors).toHaveLength(0);
  });

  test("refuse un tableau de cases à cocher contenant une option inconnue", () => {
    const f = [
      field({
        key: "langues",
        type: "checkbox",
        options: [
          { value: "fr", label: "Français" },
          { value: "en", label: "Anglais" },
        ],
      }),
    ];
    expect(validateSubmission(f, { langues: ["fr", "de"] }).errors).toHaveLength(1);
    const ok = validateSubmission(f, { langues: ["fr", "en"] });
    expect(ok.errors).toHaveLength(0);
    expect(ok.clean.langues).toEqual(["fr", "en"]);
  });

  test("rejette une date non analysable", () => {
    const f = [field({ key: "d", type: "date" })];
    expect(validateSubmission(f, { d: "32/13/2026" }).errors).toHaveLength(1);
    expect(validateSubmission(f, { d: "2026-07-08" }).errors).toHaveLength(0);
  });

  test("refuse une grille soumise sous forme de tableau", () => {
    const f = [field({ key: "g", type: "grid" })];
    expect(validateSubmission(f, { g: ["ligne"] }).errors).toHaveLength(1);
    expect(validateSubmission(f, { g: { l1: "c1" } }).errors).toHaveLength(0);
  });

  test("refuse une signature requise trop courte pour être une image", () => {
    const f = [field({ key: "sig", type: "signature", required: true })];
    expect(validateSubmission(f, { sig: "—" }).errors).toHaveLength(1);
    expect(validateSubmission(f, { sig: "data:image/png;base64," + "A".repeat(80) }).errors).toHaveLength(0);
  });
});

describe("validateSubmission- logique conditionnelle", () => {
  const fields = [
    field({
      key: "abonne",
      type: "radio",
      options: [
        { value: "oui", label: "Oui" },
        { value: "non", label: "Non" },
      ],
    }),
    field({ key: "motif", type: "short_text", required: true, condition: { fieldKey: "abonne", value: "non" } }),
  ];

  test("n'exige pas un champ requis dont la condition n'est pas remplie", () => {
    const { errors, clean } = validateSubmission(fields, { abonne: "oui" });
    expect(errors).toHaveLength(0);
    expect(clean).not.toHaveProperty("motif");
  });

  test("exige le champ lorsque la condition est remplie", () => {
    expect(validateSubmission(fields, { abonne: "non" }).errors).toHaveLength(1);
  });

  test("écarte la valeur d'un champ caché même si le client l'envoie", () => {
    const { clean } = validateSubmission(fields, { abonne: "oui", motif: "valeur fantôme" });
    expect(clean).not.toHaveProperty("motif");
  });

  test("satisfait une condition portant sur un champ à choix multiples", () => {
    const f = [
      field({
        key: "langues",
        type: "checkbox",
        options: [
          { value: "fr", label: "FR" },
          { value: "en", label: "EN" },
        ],
      }),
      field({ key: "niveau", type: "short_text", required: true, condition: { fieldKey: "langues", value: "en" } }),
    ];
    expect(validateSubmission(f, { langues: ["fr"] }).errors).toHaveLength(0);
    expect(validateSubmission(f, { langues: ["fr", "en"] }).errors).toHaveLength(1);
  });

  test("masque tous les champs d'une section dont la condition est fausse", () => {
    const f = [
      field({
        key: "type",
        type: "radio",
        options: [
          { value: "pro", label: "Pro" },
          { value: "particulier", label: "Particulier" },
        ],
      }),
      field({ key: "page_pro", type: "section", condition: { fieldKey: "type", value: "pro" } }),
      field({ key: "siret", type: "short_text", required: true }),
    ];
    expect(validateSubmission(f, { type: "particulier" }).errors).toHaveLength(0);
    expect(validateSubmission(f, { type: "pro" }).errors).toHaveLength(1);
  });
});

describe("validateSubmission- justifications", () => {
  const f = [
    field({
      key: "avis",
      type: "radio",
      requireJustification: true,
      options: [{ value: "non", label: "Non" }],
    }),
  ];

  test("conserve la justification associée à un champ à choix", () => {
    const { clean } = validateSubmission(f, { avis: "non", [`avis${JUSTIFICATION_SUFFIX}`]: "  trop cher  " });
    expect(clean[`avis${JUSTIFICATION_SUFFIX}`]).toBe("trop cher");
  });

  test("tronque une justification excessivement longue", () => {
    const { clean } = validateSubmission(f, {
      avis: "non",
      [`avis${JUSTIFICATION_SUFFIX}`]: "x".repeat(5000),
    });
    expect(String(clean[`avis${JUSTIFICATION_SUFFIX}`])).toHaveLength(2000);
  });

  test("ignore une justification sur un type de champ non justifiable", () => {
    const texte = [field({ key: "nom", type: "short_text", requireJustification: true })];
    const { clean } = validateSubmission(texte, { nom: "Ada", [`nom${JUSTIFICATION_SUFFIX}`]: "peu importe" });
    expect(clean).not.toHaveProperty(`nom${JUSTIFICATION_SUFFIX}`);
  });
});

describe("safeRegexTest", () => {
  test("applique une expression régulière valide", () => {
    expect(safeRegexTest("^[0-9]{5}$", "75001")).toBe(true);
    expect(safeRegexTest("^[0-9]{5}$", "7500")).toBe(false);
  });

  test("laisse passer la saisie plutôt que de planter sur une regex malformée", () => {
    expect(safeRegexTest("([a-z", "peu importe")).toBe(true);
  });
});
