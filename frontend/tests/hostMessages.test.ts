/**
 * Tri des messages remontés par un formulaire intégré.
 *
 * La page hôte reçoit `message` de toutes les fenêtres avec lesquelles elle
 * est en relation : publicités, autres widgets, cadres tiers. Ce filtre est la
 * seule chose qui empêche l'un d'eux de redimensionner le formulaire ou de
 * faire croire à l'hôte qu'une réponse a été enregistrée.
 */
import { describe, expect, it } from "bun:test";
import { interpretHostMessage } from "../embed/hostMessages.ts";

const frame = { nom: "le cadre du formulaire" };
const expected = { origin: "https://forms.exemple.com", source: frame, slug: "mon-slug" };

const message = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) => ({
  origin: over.origin ?? expected.origin,
  source: "source" in over ? over.source : frame,
  data,
});

describe("interpretHostMessage", () => {
  it("accepte une hauteur venue du bon cadre", () => {
    expect(
      interpretHostMessage(message({ type: "openforms:resize", slug: "mon-slug", height: 640 }), expected),
    ).toEqual({ kind: "resize", height: 640 });
  });

  it("accepte une demande de cadrage", () => {
    expect(
      interpretHostMessage(message({ type: "openforms:scroll", slug: "mon-slug" }), expected),
    ).toEqual({ kind: "scroll" });
  });

  it("accepte un accusé de soumission", () => {
    expect(
      interpretHostMessage(
        message({ type: "openforms:submitted", slug: "mon-slug", responseId: "r-1" }),
        expected,
      ),
    ).toEqual({ kind: "submitted", responseId: "r-1" });
  });

  it("tolère un accusé sans identifiant de réponse", () => {
    expect(
      interpretHostMessage(message({ type: "openforms:submitted", slug: "mon-slug" }), expected),
    ).toEqual({ kind: "submitted", responseId: undefined });
  });

  it("refuse un message d'une autre origine", () => {
    expect(
      interpretHostMessage(
        message({ type: "openforms:resize", slug: "mon-slug", height: 9000 }, { origin: "https://pirate.test" }),
        expected,
      ),
    ).toBeNull();
  });

  it("refuse un message d'une autre fenêtre, même de la bonne origine", () => {
    expect(
      interpretHostMessage(
        message({ type: "openforms:resize", slug: "mon-slug", height: 9000 }, { source: { autre: true } }),
        expected,
      ),
    ).toBeNull();
  });

  it("refuse un message destiné à un autre formulaire de la page", () => {
    expect(
      interpretHostMessage(message({ type: "openforms:resize", slug: "autre-slug", height: 300 }), expected),
    ).toBeNull();
  });

  it("refuse un type inconnu", () => {
    expect(
      interpretHostMessage(message({ type: "openforms:whatever", slug: "mon-slug" }), expected),
    ).toBeNull();
  });

  it("refuse une hauteur inexploitable", () => {
    for (const height of [0, -50, Number.NaN, Number.POSITIVE_INFINITY, "640"]) {
      expect(
        interpretHostMessage(message({ type: "openforms:resize", slug: "mon-slug", height }), expected),
      ).toBeNull();
    }
  });

  it("ne bronche pas sur une charge utile absurde", () => {
    for (const data of [null, undefined, "coucou", 42, []]) {
      expect(interpretHostMessage(message(data), expected)).toBeNull();
    }
  });
});
