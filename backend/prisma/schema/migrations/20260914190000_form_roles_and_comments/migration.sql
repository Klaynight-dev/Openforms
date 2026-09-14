-- Cercle 1 (formulaire) : FormAccess.permission (READ/WRITE) devient
-- FormAccess.role (VIEWER/COMMENTER/EDITOR). Migration des données :
-- READ -> VIEWER, WRITE -> EDITOR (aucun accès existant n'est perdu).
-- Cercle 2 (organisation) : OrganizationMember.role passe de TEXT libre à
-- un enum OrgRole typé (OWNER/ADMIN/MEMBER)- les valeurs existantes sont
-- converties en place, sans perte.
-- Ajoute aussi le modèle Comment (rôle COMMENTER).

-- CreateEnum
CREATE TYPE "FormRole" AS ENUM ('VIEWER', 'COMMENTER', 'EDITOR');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable FormAccess : ajoute "role", le remplit depuis "permission", puis retire l'ancienne colonne.
ALTER TABLE "FormAccess" ADD COLUMN "role" "FormRole";

UPDATE "FormAccess"
SET "role" = CASE "permission"
  WHEN 'WRITE' THEN 'EDITOR'::"FormRole"
  ELSE 'VIEWER'::"FormRole"
END;

ALTER TABLE "FormAccess" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "FormAccess" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
ALTER TABLE "FormAccess" DROP COLUMN "permission";

-- DropEnum (FormPermission n'est plus référencé par aucune colonne)
DROP TYPE "FormPermission";

-- AlterTable OrganizationMember : conversion de type en place (TEXT -> OrgRole), aucune perte.
ALTER TABLE "OrganizationMember" ALTER COLUMN "role" TYPE "OrgRole" USING ("role"::"OrgRole");

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_formId_idx" ON "Comment"("formId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
