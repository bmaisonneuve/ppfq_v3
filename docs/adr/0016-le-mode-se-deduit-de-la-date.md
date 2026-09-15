# Le mode se déduit de la date, et l'archive est un préfixe d'URL

L'archive ajoute une deuxième façon de jouer la même grille. Tout ce que ce
ticket a d'inhabituel tient à une phrase des specs §7 : « les grilles jouées en
archive n'alimentent pas les compteurs de la grille du jour — sinon une série de
200 jours se reconstruit en une soirée ». Ce n'est pas une préférence
d'affichage, c'est la seule chose qui empêche le compteur le plus visible du jeu
d'être gratuit. Les cinq décisions ci-dessous en découlent.

## Le mode n'est jamais dans une requête

`player_progress.mode` existe depuis #8 et attendait ce ticket. La façon
évidente de le remplir aurait été de le faire voyager : le client sait bien s'il
est sur `/2` ou sur `/archive/2026-09-08/2`, et une requête d'état de plus n'est
qu'un champ.

C'est exactement ce qu'il ne faut pas faire. Un champ que le client écrit est un
champ que le client choisit, et l'un des deux choix — jouer une grille de l'an
dernier en se disant `daily` — reconstruit la série que la règle existe pour
protéger. Le contrôle n'aurait pas été une garantie de plus à ajouter : il
aurait été *la* garantie, cachée dans une validation.

Alors le client envoie ce qu'il sait vraiment — **la date de la grille qu'il
tient**, qu'il envoyait déjà — et le serveur en tire le mode contre sa propre
horloge (`server/domain/archive.ts`). Aujourd'hui donne `daily`, le passé donne
`archive`, l'avenir ne donne rien du tout. Il n'y a plus de champ à valider,
parce qu'il n'y a plus de champ.

La même règle vaut pour la porte des statistiques : elle accepte une **date**
optionnelle et jamais un mode. Ce qui est une lecture, donc sans enjeu de
triche, garde la règle quand même — deux conventions pour un même fait finissent
par diverger, et celle qui divergerait serait celle qu'on relit le moins.

Cela contredit une phrase de l'ADR-0013 : « tout écrit `daily` tant que
l'archive n'existe pas ». C'était le bon état à ce moment-là, et c'est
précisément la ligne que ce ticket vient remplacer.

## Une grille à venir se refuse, et c'est la seule fuite du ticket

Les grilles sont programmées à l'avance : `daily_challenges` contient demain, et
souvent la semaine. « Lire une grille par sa date » était sans danger tant
qu'une seule date était lisible ; ouvrir l'archive rend lisible n'importe
laquelle, demain compris.

Le refus est donc dans la règle d'accès et pas dans un écran, et il arrive
**avant** la lecture : `getArchiveScreen` décide du droit puis lit la grille,
dans cet ordre, de sorte qu'une énigme à venir n'est jamais chargée en mémoire
pour être ensuite retenue. L'index du calendrier applique la même retenue à sa
propre échelle : un jour à venir y apparaît, sans son thème — un « rétro »
affiché la veille au soir dirait déjà quelque chose.

`not-yet` est un 404 et non un 403, et la nuance porte : un 403 laisserait
entendre qu'un compte l'ouvrirait.

## Sept jours, et « avoir un compte » est une colonne

`account-required` est un 403, et c'est le seul refus du jeu qui se répare en
dix secondes : c'est « la première raison concrète de s'inscrire ». L'écran ne
se contente donc pas de refuser — il ouvre la fenêtre du compte sur place, sans
quitter l'adresse où l'on voulait aller, et les cases verrouillées du calendrier
font de même.

Ce qui ouvre l'archive complète est **`players.auth_user_id`**, la colonne que
pose la reprise de progression (ADR-0003), et non « une session ouverte ». Les
deux coïncident presque toujours, puisque c'est la session qui désigne le joueur
(`currentPlayerId`), et il fallait choisir laquelle des deux fait foi : un
navigateur qui porte le cookie d'un joueur lié garde l'archive complète après
une déconnexion, ce qui est cohérent avec ADR-0003 — « tenir ce cookie, *c'est*
être ce joueur ». Le rendu et la porte lisent donc la même chose, sans quoi
l'écran montrerait un cadenas sur une grille que le serveur accepte, ce qui est
la pire des deux erreurs : elle ne se voit dans aucun test du serveur.

La lecture est **conditionnelle**, et c'est ce qui garde le chemin du pic
intact : la grille du jour et les sept jours ouverts répondent sans lire une
ligne de plus sur `players` (`needsAccountCheck`). Seule une journée lointaine
paie cette requête, et personne n'y arrive par accident.

Sept **jours passés**, aujourd'hui non compris : la grille du jour n'est pas de
l'archive, elle est le jeu. Elle a son adresse à elle, et le calendrier y
renvoie plutôt que de la rejouer — sinon la même journée compterait deux fois,
dans deux modes.

## L'archive est un préfixe d'URL, pas une deuxième interface

« La mécanique de jeu en archive est identique à celle du quotidien » (specs §7)
pouvait se tenir de deux façons : réécrire les écrans en les tenant en phase à
la main, ou n'en avoir qu'un jeu. Les quatre écrans du jeu — l'aperçu, les trois
niveaux — sont donc **les mêmes fichiers**, montés sous le même `GameProvider`,
et tout ce qui les sépare est **une** prop : la journée d'archive dont ils
parlent, absente sur la grille du jour. Le préfixe d'où partent leurs liens —
vide pour le quotidien, `/archive/<date>` pour une journée passée — s'en déduit
une fois, dans le provider, plutôt que de voyager à côté : deux props qui disent
la même chose finissent par se contredire.

Un écran ne sait donc pas dans quel mode il est joué. Il sait d'où partent ses
liens, ce qui est tout ce que la différence vaut en interface, et le mode reste
une affaire de serveur.

Trois retenues seulement, et chacune est une règle plutôt qu'un goût : **pas de
série** — l'archive n'en a pas, et un « Série 0 » sous une grille qu'on vient de
gagner se lirait comme une série perdue —, **pas de résumé partagé** — il est
celui de la grille du jour (specs §8) —, et **pas de compte à rebours**,
puisqu'aucune nouvelle grille n'arrive sur une journée terminée.

## Le groupe de routes est à part, et c'est l'ADR-0008 qui l'impose

La page de la grille du jour ne lit rien qui appartienne à une requête : c'est
ce qui la garde prérendue, servie entière depuis un cache partagé, et incapable
de faire fuir l'état d'un joueur vers l'écran d'un autre.

L'archive fait l'inverse, en connaissance de cause : ce qu'elle affiche dépend
de qui regarde. Elle vit donc dans son propre groupe de routes, `app/(archive)/`,
hors de portée du layout de `(game)` — la glisser dessous aurait rendu dynamique
tout ce qu'il y a là, y compris la page que l'ADR-0008 protège. Le groupe n'a pas
de layout à lui : c'est `archive/[date]/layout.tsx` qui lit la journée et monte
le provider, parce que c'est ce segment-là qui connaît la date, et l'index du
calendrier n'a rien à partager avec lui. `test/architecture/static-game-page.test.ts`
le vérifie ligne à ligne, et la sortie de `pnpm build` le dit d'un coup d'œil :
`○ /` et `● /1` d'un côté, `ƒ /archive/...` de l'autre.

L'ADR-0008 annonçait l'arbitrage à faire le jour venu — `generateStaticParams`
sur une fenêtre courte, ou génération à la première visite. Aucun des deux : ces
pages **ne sont pas cachables**, puisque leur contenu dépend du compte de celui
qui les demande. Le prérendu n'était donc pas un choix de performance à faire,
c'était une option que le droit d'accès ferme.

## Ce qui n'est pas fait

**Aucune progression personnelle sur l'index.** Le calendrier dit quelles
journées existent et lesquelles se rejouent ; il ne dit pas lesquelles ont été
gagnées. Le faire demanderait de résoudre un joueur pendant un rendu, donc de
poser un cookie, ce qu'un rendu ne sait pas faire (`player.service.ts`) — il
faudrait une requête personnelle de plus, sur un écran de navigation. Le jour où
ça vaudra le coup, elle se rangera dans la file de `use-day-plays.ts` comme le
reste.

**Aucune borne ancienne à la navigation par mois.** On peut remonter
indéfiniment vers le passé et tomber sur des mois vides. Une borne demanderait
de connaître la première grille jamais programmée, donc une lecture de plus à
chaque mois affiché, pour éviter un aller-retour que personne ne fait deux fois.

**Aucun test d'interface**, comme les tickets précédents : le dépôt n'en a aucun
et celui-ci n'en introduit pas le premier. Ce qui est affirmé est ce qui décide
— la fenêtre de sept jours, le mode, le droit, les deux lignes d'agrégats — dans
`test/shared/archive.test.ts`, `test/domain/archive.test.ts` et
`test/services/archive.service.test.ts`.
