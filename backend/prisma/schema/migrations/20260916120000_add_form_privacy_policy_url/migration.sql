-- Lien de politique de confidentialité configurable par formulaire (donc par
-- organisation ou par compte personnel), au lieu d'un unique lien /legal/confidentialite
-- codé en dur pour toute l'instance.
ALTER TABLE "Form" ADD COLUMN "privacyPolicyUrl" TEXT;
