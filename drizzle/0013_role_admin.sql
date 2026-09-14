-- Le rôle d'admin devient une colonne, et `ADMIN_EMAILS` disparaît (ADR-0015).
--
-- Le défaut est `player`, et c'est lui qui porte la garantie : Better Auth
-- insère ses lignes sans connaître cette colonne, donc toute inscription — par
-- code comme par lien — crée un joueur. On ne devient admin que par un UPDATE
-- écrit à la main sur la base, c'est-à-dire par un accès que seul l'exploitant
-- a, et il n'y a aucun écran qui accorde le rôle.
--
-- Rien n'est repris de `ADMIN_EMAILS` par cette migration, et c'est volontaire :
-- elle tourne sur une base dont on ignore l'environnement, et deviner une liste
-- d'adresses pour la promouvoir serait exactement l'automatisme qu'on ne veut
-- pas ici. Après déploiement, la première promotion est à faire à la main :
--
--     pnpm admin:grant vous@exemple.fr
--
-- Elle suppose que le compte existe déjà — donc que la personne s'est connectée
-- au moins une fois côté jeu. C'est la conséquence acceptée d'un rôle porté par
-- la ligne d'un compte plutôt que par une liste d'adresses.

CREATE TYPE "public"."user_role" AS ENUM('player', 'admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'player' NOT NULL;
