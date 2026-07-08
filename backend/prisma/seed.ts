/**
 * Amorçage : crée le compte Super Admin initial et un formulaire de démonstration.
 * Idempotent — relançable sans créer de doublons.
 *
 *   bun run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env.ts";
import { hashPassword } from "../src/services/crypto.ts";

const prisma = new PrismaClient();

async function main() {
  const email = env.seedAdminEmail.toLowerCase();

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await hashPassword(env.seedAdminPassword),
      role: "SUPER_ADMIN",
      displayName: "Super Admin",
    },
  });
  console.log(`✔ Super Admin : ${admin.email}`);

  const existing = await prisma.form.findFirst({ where: { title: "Formulaire de contact — démo" } });
  if (!existing) {
    const form = await prisma.form.create({
      data: {
        slug: "demo-contact",
        title: "Formulaire de contact — démo",
        description: "Un exemple montrant plusieurs types de champs.",
        ownerId: admin.id,
        isPublished: true,
        requireConsent: true,
        consentText:
          "J'accepte que mes réponses soient traitées dans le cadre de cette démonstration, conformément au RGPD.",
        schema: [
          { key: "nom", type: "short_text", label: "Votre nom", required: true, validation: { maxLength: 120 } },
          { key: "email", type: "email", label: "Votre email", required: true },
          {
            key: "sujet",
            type: "select",
            label: "Sujet",
            required: true,
            options: [
              { value: "info", label: "Demande d'information" },
              { value: "benevolat", label: "Bénévolat" },
              { value: "don", label: "Don" },
            ],
          },
          { key: "message", type: "paragraph", label: "Votre message", required: true, validation: { minLength: 10 } },
          {
            key: "satisfaction",
            type: "radio",
            label: "Comment nous avez-vous connus ?",
            required: false,
            options: [
              { value: "web", label: "Internet" },
              { value: "amis", label: "Bouche à oreille" },
              { value: "event", label: "Événement" },
            ],
          },
        ],
        metaColumns: [
          { key: "statut", label: "Statut de traitement", kind: "text" },
          { key: "note", label: "Note interne", kind: "text" },
        ],
      },
    });
    console.log(`✔ Formulaire de démo : /f/${form.slug}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
