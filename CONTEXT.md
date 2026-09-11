# Quiz de parcours footballistiques

Jeu quotidien : identifier un footballeur à partir de son parcours en clubs. Ce glossaire fixe le vocabulaire commun aux specs fonctionnelles, au schéma de données et au code.

## Le jeu

**Grille** :
L'ensemble des trois énigmes d'une même date, avec son thème. C'est l'unité que le joueur « termine » et sur laquelle se calcule le carton plein. En base : `daily_challenges`.
_Avoid_: puzzle du jour, board du jour

**Énigme** :
Un des trois footballeurs à trouver d'une grille, identifié par sa position. Elle désigne un footballeur du catalogue, elle n'en copie rien. En base : `challenge_items`.
_Avoid_: puzzle, slot, question

**Position** :
Le rang d'une énigme dans sa grille : 1 l'échauffement, 2 le titulaire, 3 la légende. Ordre de difficulté croissante décidé à la main. Un passage dans un parcours n'a pas de rang stocké : il est ordonné par son année de début.
_Avoid_: slot, niveau, difficulté

**Passer** :
Dévoiler l'indice suivant sans proposer de footballeur. Consomme un essai, comme une erreur.
_Avoid_: coup de pouce, skip, indice gratuit

**Thème** :
Ce qu'annonce une grille : standard, rétro, mercato, hors-série. Champ libre, propriété de la grille entière et jamais d'une énigme seule. Aucun jour de la semaine ne lui est attaché et aucun contrôle automatique ne s'y rattache.

**Essai** :
Un footballeur proposé pour une énigme, choisi dans la liste de recherche. Six essais par énigme, et **tout en consomme un** : une mauvaise réponse, un footballeur déjà proposé, un tour passé (specs §3 et §10). Le septième est refusé par le service.

À ne pas confondre avec le **double-clic**, qui est son exact contraire : la même proposition arrivant deux fois en moins de deux secondes ne consomme rien. Le doublon est une règle de jeu, le double-clic une protection technique.
_Avoid_: tentative, guess, réponse

**Partie** :
L'état serveur d'un joueur sur une énigme : essais consommés, indices dévoilés, issue. Créée à l'ouverture de l'énigme, pas au premier essai. Une partie ouverte et non terminée avant le changement de grille compte comme un échec. En base : `player_progress` — une ligne mutable, jamais un journal d'événements.
_Avoid_: session (le mot appartient à l'authentification), game_session, play_history

**Mode** :
Le cadre dans lequel une partie est jouée : quotidien ou archive. Seul le quotidien alimente la série et les cartons pleins.

**Archive** :
Les grilles des jours passés, rejouables sans compter pour le score. Les sept derniers jours sont ouverts à tous, au-delà il faut un compte.

**Carton plein** :
Les trois énigmes d'une même grille trouvées. Se calcule au niveau de la grille, pas de l'énigme.

**Série** :
Le nombre de jours consécutifs où le titulaire (position 2) a été trouvé sur la grille du jour. L'échauffement, la légende et l'archive n'y entrent pas.
_Avoid_: streak (nom des colonnes `current_streak` / `best_streak`, et rien d'autre)

**Résumé partagé** :
Les trois lignes de symboles qu'un joueur copie à la fin de sa grille du jour — une par position, le nombre d'essais consommés lisible, et aucun nom de footballeur. En en-tête, la date de la grille et son thème : une grille se nomme par sa date partout ailleurs, et un numéro aurait demandé un jour 1 arbitraire.

**Jamais stocké** : il se dérive des trois parties et de la grille à chaque affichage, donc il n'a pas d'identifiant et rien ne s'invalide quand une partie bouge. Il n'est proposé qu'à partir du **premier essai consommé**, et non dès qu'une énigme a été ouverte : une partie naît à l'ouverture, donc une grille simplement dépliée aurait sinon produit un bilan de trois échecs.
_Avoid_: partage, score du jour, board

**Notoriété** :
Le nombre d'éditions Wikipédia consacrées à un footballeur. Sert uniquement à classer les résultats de recherche et à départager les homonymes à l'import. Jamais affichée, jamais utilisée pour estimer la difficulté.
_Avoid_: sitelinks (nom de la colonne), popularité

## Le catalogue

**Footballeur** :
La personne à faire deviner. Distinct du joueur qui joue au jeu.
_Avoid_: player (ambigu), joueur

**Référentiel de recherche** :
L'ensemble des footballeurs qu'on peut proposer dans la barre de recherche. Bien plus large que ceux qui sont jouables, précisément pour que les suggestions ne révèlent rien. Ce n'est pas une table à part : le référentiel et le catalogue curé sont les mêmes lignes de `footballers`, « curé » étant le fait d'avoir des passages.
_Avoid_: index de recherche, liste de footballeurs

**Alias** :
Un nom d'usage sous lequel un footballeur peut être cherché sans jamais être affiché : surnom (« Zizou », « Chicharito »), nom complet, ou variante d'orthographe. Une suggestion montre toujours le nom canonique du footballeur, jamais l'alias qui a permis de le trouver. En base : `footballer_names`, avec `is_canonical = false`.
_Avoid_: surnom (un alias n'est pas toujours un surnom), synonyme

**Terme** :
La forme normalisée d'un nom canonique ou d'un alias — minuscules, sans accents, un espace entre les mots — telle qu'elle est indexée et telle que la saisie du joueur est normalisée avant d'être cherchée. Une seule définition, dans `src/shared/search.ts`.

Chaque **mot après le premier** d'un nom est en plus indexé comme un terme à lui seul, sinon un nom de famille n'est pas tapable : l'index de préfixe est ancré au début d'un terme, et Wikidata ne livre un alias « Papin » que pour 28 % des footballeurs notoires. Un terme de mot n'est ni un nom canonique ni un alias : il n'est jamais affiché.
_Avoid_: mot-clé, slug

**Passage** :
Un séjour d'un footballeur dans un club, à sa place dans la chronologie. Un même club traversé deux fois donne deux passages distincts. En base : `player_clubs`.
_Avoid_: career_stint, contrat, transfert

**Prêt** :
Un passage effectué en prêt. Simple annotation à côté du club, jamais un club à part.

**Parcours** :
La suite ordonnée des passages seniors d'un footballeur. C'est l'énigme elle-même : il est affiché intégralement dès le départ.
_Avoid_: carrière, historique

**Carrière senior** :
Le seul périmètre retenu. Les équipes de jeunes, les équipes réserve et les sélections nationales ne font pas partie d'un parcours et ne sont pas stockées.

**Durée d'un passage** :
Le nombre de saisons affiché au 2e palier d'indices, compté comme `end_year - start_year + 1` : 2015-2015 vaut 1 saison, 2015-2016 en vaut 2. Approximation assumée, calculée au rendu.

**Nationalité** :
La nationalité sportive d'un footballeur, une seule même pour un binational. Table à part, avec son nom localisé et son drapeau.

**Blason** :
L'écusson d'un club. Vit dans Postgres, adressé par le SHA-256 de ses octets : la même image est une seule ligne, et remplacer le blason d'un club change son adresse donc son URL. Extrait de l'image principale de l'article fr.wikipedia du club, en.wikipedia seulement à défaut ; l'extraction ne remplace jamais celui qui est déjà là. Affiché au back-office, pas au joueur. En base : `club_crests`, pointé par `clubs.crest_key`.
_Avoid_: logo, écusson, crest (dans les textes français)

**Curation** :
Le travail de l'admin sur un footballeur : relire ce que l'import a produit, corriger ce que la source donne mal ou pas du tout, ajouter le passage qu'elle ignore, saisir matchs, buts et nationalité. Elle a un pendant côté club — renommer, donner un blason, fusionner un doublon — qui se fait sur la **fiche du club** et vaut pour tous les footballeurs qui y sont passés. Rien ne l'enregistre — « curé » reste le fait d'avoir des passages, et il n'y a ni statut de vérification ni date. Ce qu'un écran de curation lit sur un footballeur est un `CurationDossier`, recomposé à chaque lecture depuis les tables.
_Avoid_: validation, vérification (rien n'est tracé), modération

**Indice** :
Une des cinq informations dévoilées palier par palier après chaque erreur : décennie de début, durée par club, nationalité, matchs en championnat par club, buts en championnat par club.
_Avoid_: matchs par club, buts par club (la source ne compte que le championnat, et l'énoncé doit le dire)

## Les personnes qui jouent

**Joueur** :
Une personne qui joue au jeu, avec ou sans compte. À ne jamais confondre avec un footballeur.
_Avoid_: utilisateur, user

**Identité anonyme** :
L'UUID en cookie qui porte la progression d'un joueur sans compte. La progression est reprise sur le compte à l'inscription.
_Avoid_: anon_id, visiteur (en base : `players.cookie_id`)
