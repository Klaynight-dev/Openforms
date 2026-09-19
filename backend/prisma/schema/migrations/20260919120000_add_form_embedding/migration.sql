-- Intégration d'un formulaire dans un site tiers (iframe, widget JS, clé d'embed).
--
-- `embedOrigins` liste les origines autorisées à afficher le formulaire hors de
-- cette instance ; vide = toutes. Le type Json (plutôt que TEXT[]) garde le
-- schéma compatible MySQL, comme "allowedEmails".
ALTER TABLE "Form" ADD COLUMN "embedEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Form" ADD COLUMN "embedOrigins" JSONB NOT NULL DEFAULT '[]';

-- Une clé d'API peut désormais être restreinte à un seul formulaire, en
-- lecture de sa définition et en soumission de réponses (scope EMBED). Les
-- clés existantes gardent la portée complète (FULL).
ALTER TABLE "ApiKey" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "ApiKey" ADD COLUMN "formId" TEXT;

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ApiKey_formId_idx" ON "ApiKey"("formId");
