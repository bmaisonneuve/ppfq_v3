# Le rôle d'admin est une colonne, et aucun écran ne l'accorde

> **Remplace la décision « le rôle est une variable d'environnement » de
> l'[ADR-0014](./0014-le-compte-nos-portes-devant-better-auth.md), elle-même
> annoncée par l'[ADR-0006](./0006-porte-du-back-office-avant-better-auth.md).**
> `ADMIN_EMAILS` disparaît. Tout le reste de ces deux ADR tient : la porte est
> le compte sans mot de passe, le contrôle est `await requireAdmin()` en
> première ligne de chaque page et de chaque action, et une adresse qui n'est
> pas celle d'un admin ne reçoit rien et ne l'apprend pas.

`ADMIN_EMAILS` liste les adresses qui ouvrent `/admin`. Elle a tenu depuis #13 et
elle a un défaut que l'usage a rendu visible : **le rôle ne vit pas là où vivent
les comptes**. Il n'est pas dans la base qu'on sauvegarde, il n'apparaît dans
aucune restauration, il se perd si personne ne pense à recopier la variable, et
le changer demande un redéploiement — c'est-à-dire que retirer son accès à
quelqu'un passe par la file d'attente d'un déploiement.

**Le rôle devient donc `users.role`**, un `pgEnum` à deux valeurs dont le défaut
est `player`.

## Pourquoi l'objection de l'ADR-0006 ne tient plus

Elle était : une colonne ajoute un état à administrer, donc un écran pour le
changer, donc une façon de plus de se donner le rôle. Le deuxième maillon est le
seul qui comptait, et **on ne le suit pas** : il n'y a pas d'écran. Rien dans ce
dépôt n'écrit `users.role`. Le seul chemin est un `UPDATE` à la main sur la base
— `pnpm admin:grant vous@exemple.fr`, qui n'est qu'une façon d'écrire la bonne
requête et de dire ce qu'elle a changé.

La population qui peut accorder le rôle est donc restée exactement la même :
celle qui a un accès à la base de production. C'était l'objectif de la variable
d'environnement, et la colonne l'atteint sans en payer le prix.

Le défaut à `player` est ce qui rend cela vrai plutôt que voulu : Better Auth
insère ses lignes sans connaître cette colonne — elle n'est pas dans les champs
qu'on lui déclare — donc **toute inscription crée un joueur**, par code comme par
lien. Il n'existe aucune séquence de gestes, dans le jeu ou dans le back-office,
qui termine sur un `role = 'admin'`.

## Le rôle est relu à chaque question, et jamais mis en cache

C'est ce que la variable ne pouvait pas faire bien, et c'est le vrai gain. Le
rôle n'est **pas** déclaré dans les champs que Better Auth recopie dans la
session : il y serait porté par le cache de cookie signé de cinq minutes
(`session.cookieCache`, ADR-0014), et une révocation traînerait cinq minutes.
Cinq minutes, c'est long quand on révoque en urgence.

Il est donc lu en base à chaque question : `isAdmin()` sur une page d'admin,
`currentAccount()` sur `POST /api/account/state`. Une ligne atteinte par sa clé
primaire ou par `users_email_key` ; aucun index nouveau, aucun des deux accès ne
balaie quoi que ce soit. **Ce n'est pas sur le chemin du pic** : les pages
d'admin sont rares, et côté jeu la lecture est payée une fois par visite et
seulement pour quelqu'un de connecté. Ce qui est appelé à chaque requête
personnelle est `currentAccountIdentity()` (ADR-0009), qui ne passe pas par là.

Accorder et retirer prennent donc effet à la requête suivante, sans déconnexion
et sans redéploiement.

## Consequences

`ADMIN_EMAILS` disparaît de `.env.example` et des variables que le déploiement
fournit. `src/server/auth/admin-emails.ts` devient `admin-role.ts` et lit la base
au lieu de l'environnement. Les signatures de `admin-auth.service.ts` ne bougent
pas, à ceci près que `isAdminEmail()` est désormais asynchrone ; aucune page ni
aucune action de curation ne change, et `test/architecture/admin-guard.test.ts`
garde la même règle.

`isAdminConfigured()` ne vaut plus que `isAccountConfigured()`. La seconde
condition d'avant — « au moins une adresse dans la variable » — n'a pas de
remplaçante, et c'est délibéré : « personne n'est admin » n'est pas un défaut de
configuration, c'est l'état normal d'une base neuve. L'esprit de l'ADR-0006 tient
quand même, et mieux : une base fraîche n'a que des `player`, donc `/admin`
refuse tout le monde tant que personne n'a été promu — l'exploitant compris, donc
il s'en aperçoit.

**Le premier admin d'un déploiement neuf doit s'être connecté une fois côté
jeu.** C'est la contrepartie d'un rôle porté par la ligne d'un compte plutôt que
par une liste d'adresses : on promeut un compte, donc il faut qu'il existe, et
un compte est fabriqué par une connexion vérifiée. `pnpm admin:grant` refuse
l'adresse inconnue plutôt que d'insérer une ligne — un script qui créerait un
compte contournerait précisément la preuve qu'une boîte a été ouverte. La marche
à suivre est donc : se connecter sur le jeu, puis se promouvoir.

La migration ne reprend rien de `ADMIN_EMAILS`. Elle tourne sur une base dont
elle ignore l'environnement, et deviner une liste d'adresses pour la promouvoir
serait exactement l'automatisme que tout ce qui précède refuse. Les déploiements
existants ont donc une promotion à faire à la main après la migration, et
`/admin` est fermé à tout le monde entre les deux.
