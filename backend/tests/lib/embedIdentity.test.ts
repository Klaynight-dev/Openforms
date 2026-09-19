/**
 * Une clé d'embed porte l'identité de son titulaire : c'est ce qui lui permet
 * d'exister, mais cette identité ne doit jamais valoir « utilisateur connecté »
 * en dehors du formulaire auquel la clé est rattachée.
 *
 * Sans cette mise à l'écart, la garde « il faut être connecté » d'un formulaire
 * PRIVATE se contentait de la présence d'un contexte d'authentification : une
 * clé publiée sur un site tiers ouvrait alors tous les formulaires privés de
 * l'instance. Ces tests figent la règle indépendamment des contrôleurs.
 */
import { describe, expect, it } from "bun:test";

type Scope = "FULL" | "EMBED";

/** Reproduit la décision prise dans form.controller et response.controller. */
function resolveAccess(opts: {
  visibility: "PUBLIC" | "PRIVATE" | "RESTRICTED";
  formId: string;
  allowedEmails?: string[];
  key?: { scope: Scope; formId: string | null };
  userEmail?: string;
}): "allow" | "401" | "403" {
  const auth = opts.userEmail ? { user: { email: opts.userEmail } } : null;
  const embedKey = opts.key?.scope === "EMBED" && opts.key.formId === opts.formId;
  const identity = opts.key?.scope === "EMBED" ? null : auth;

  if (embedKey) return "allow";
  if (opts.visibility === "PRIVATE") return identity ? "allow" : "401";
  if (opts.visibility === "RESTRICTED") {
    if (!identity) return "401";
    const allowed = (opts.allowedEmails ?? []).some(
      (e) => e.toLowerCase() === identity.user.email.toLowerCase(),
    );
    return allowed ? "allow" : "403";
  }
  return "allow";
}

const OWN = "form-a";
const OTHER = "form-b";

describe("portée d'une clé d'embed", () => {
  it("ouvre le formulaire PRIVATE auquel elle est rattachée", () => {
    expect(
      resolveAccess({
        visibility: "PRIVATE",
        formId: OWN,
        key: { scope: "EMBED", formId: OWN },
        userEmail: "proprietaire@test.local",
      }),
    ).toBe("allow");
  });

  it("ouvre le formulaire RESTRICTED auquel elle est rattachée, sans figurer sur la liste", () => {
    expect(
      resolveAccess({
        visibility: "RESTRICTED",
        formId: OWN,
        allowedEmails: ["quelquun-dautre@test.local"],
        key: { scope: "EMBED", formId: OWN },
        userEmail: "proprietaire@test.local",
      }),
    ).toBe("allow");
  });

  it("n'ouvre AUCUN autre formulaire privé, malgré l'identité qu'elle porte", () => {
    expect(
      resolveAccess({
        visibility: "PRIVATE",
        formId: OTHER,
        key: { scope: "EMBED", formId: OWN },
        userEmail: "proprietaire@test.local",
      }),
    ).toBe("401");
  });

  it("n'ouvre pas un autre formulaire restreint où son titulaire est pourtant autorisé", () => {
    expect(
      resolveAccess({
        visibility: "RESTRICTED",
        formId: OTHER,
        allowedEmails: ["proprietaire@test.local"],
        key: { scope: "EMBED", formId: OWN },
        userEmail: "proprietaire@test.local",
      }),
    ).toBe("401");
  });

  it("laisse une session ordinaire jouer son rôle", () => {
    expect(
      resolveAccess({ visibility: "PRIVATE", formId: OTHER, userEmail: "membre@test.local" }),
    ).toBe("allow");
  });

  it("laisse une clé FULL agir comme son titulaire", () => {
    expect(
      resolveAccess({
        visibility: "PRIVATE",
        formId: OTHER,
        key: { scope: "FULL", formId: null },
        userEmail: "membre@test.local",
      }),
    ).toBe("allow");
  });

  it("ne donne rien à un visiteur anonyme sur un formulaire privé", () => {
    expect(resolveAccess({ visibility: "PRIVATE", formId: OWN })).toBe("401");
  });
});
