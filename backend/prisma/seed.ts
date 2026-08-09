/**
 * Amorce de la base : crée le premier compte SUPER_ADMIN et, en développement,
 * un formulaire de démonstration.
 *
 * Sans cette amorce, une base neuve ne contient aucun compte et la création de
 * comptes se faisant uniquement par invitation, l'instance serait inutilisable
 * sans passer par Prisma Studio.
 *
 * Idempotent : relancer le script ne duplique rien et ne réinitialise jamais le
 * mot de passe d'un compte existant.
 *
 * Variables d'environnement :
 *   ADMIN_EMAIL     Email du premier administrateur (défaut : admin@openforms.local)
 *   ADMIN_PASSWORD  Mot de passe. Si absent, un mot de passe fort est généré
 *                   et affiché UNE SEULE FOIS dans la sortie du script.
 *   SEED_DEMO_FORM  "true" pour créer aussi un formulaire de démonstration.
 *
 * Usage : bun run db:seed
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[seed] DATABASE_URL manquante.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Mot de passe aléatoire lisible : 24 caractères base64url, ~144 bits d'entropie. */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

const DEMO_FORM = {
  slug: "demo",
  title: "Formulaire de démonstration",
  description:
    "Un exemple couvrant plusieurs types de champs. Supprimez-le une fois votre instance en place.",
  schema: [
    {
      key: "nom",
      type: "short_text",
      label: "Votre nom",
      required: true,
      validation: { maxLength: 120 },
    },
    {
      key: "email",
      type: "email",
      label: "Votre email",
      required: true,
      description: "Utilisé uniquement pour vous répondre.",
    },
    {
      key: "profil",
      type: "radio",
      label: "Vous êtes…",
      required: true,
      options: [
        { value: "association", label: "Une association" },
        { value: "entreprise", label: "Une entreprise" },
        { value: "particulier", label: "Un particulier" },
      ],
    },
    {
      key: "siret",
      type: "short_text",
      label: "Numéro SIRET",
      required: true,
      // Démontre la logique conditionnelle : visible pour les entreprises seulement.
      condition: { fieldKey: "profil", value: "entreprise" },
    },
    {
      key: "satisfaction",
      type: "linear_scale",
      label: "À quel point recommanderiez-vous OpenForms ?",
      required: false,
      scale: { min: 1, max: 10, minLabel: "Pas du tout", maxLabel: "Absolument" },
    },
    {
      key: "commentaire",
      type: "paragraph",
      label: "Un commentaire ?",
      required: false,
      validation: { maxLength: 2000 },
    },
  ],
  metaColumns: [
    { key: "statut", label: "Statut de traitement", kind: "text" },
    { key: "note_double", label: "Satisfaction ×2", kind: "formula", formula: "=satisfaction*2" },
  ],
};

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@openforms.local").trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Le compte ${email} existe déjà — aucun changement.`);
  } else {
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD ?? generatePassword();
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 19456,
      timeCost: 2,
    });

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "SUPER_ADMIN",
        displayName: "Administrateur",
        isActive: true,
      },
    });

    console.log("");
    console.log("  ┌────────────────────────────────────────────────────────┐");
    console.log("  │  Compte SUPER_ADMIN créé                               │");
    console.log("  └────────────────────────────────────────────────────────┘");
    console.log(`     Email        : ${email}`);
    console.log(`     Mot de passe : ${password}`);
    if (generated) {
      console.log("");
      console.log("     ⚠  Mot de passe généré aléatoirement et affiché une seule fois.");
      console.log("        Notez-le maintenant, puis changez-le à la première connexion.");
    }
    console.log("");
  }

  if (process.env.SEED_DEMO_FORM === "true") {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    const already = await prisma.form.findUnique({ where: { slug: DEMO_FORM.slug } });
    if (already) {
      console.log(`[seed] Le formulaire de démonstration « /f/${DEMO_FORM.slug} » existe déjà.`);
    } else {
      await prisma.form.create({
        data: {
          slug: DEMO_FORM.slug,
          title: DEMO_FORM.title,
          description: DEMO_FORM.description,
          schema: DEMO_FORM.schema,
          metaColumns: DEMO_FORM.metaColumns,
          isPublished: true,
          visibility: "PUBLIC",
          requireConsent: true,
          consentText:
            "J'accepte que mes réponses soient conservées pour le traitement de cette demande.",
          ownerId: owner.id,
        },
      });
      console.log(`[seed] Formulaire de démonstration créé : /f/${DEMO_FORM.slug}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error("[seed] Échec :", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
