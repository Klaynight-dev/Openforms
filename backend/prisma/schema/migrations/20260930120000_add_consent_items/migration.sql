-- Consentement découpé par finalité (collecte, traitement, stockage…) :
-- chaque acceptation a sa propre case, et la réponse garde la trace de ce qui
-- a été accepté.
ALTER TABLE "Form" ADD COLUMN "consentItems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Form" ADD COLUMN "consentPosition" TEXT NOT NULL DEFAULT 'END';
ALTER TABLE "Response" ADD COLUMN "consents" JSONB;
