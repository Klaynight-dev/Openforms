-- Répartition des participants entre plusieurs variantes d'un questionnaire
-- (champ de type "rotation") : chaque ouverture du formulaire prend le numéro
-- suivant, et la variante attribuée est celle de rang `numéro % nombre de
-- variantes`.
ALTER TABLE "Form" ADD COLUMN "rotationCounter" INTEGER NOT NULL DEFAULT 0;
