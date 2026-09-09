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
Un footballeur proposé pour une énigme, choisi dans la liste de recherche. Six essais par énigme ; un footballeur déjà tenté n'en consomme pas.
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
_Avoid_: streak

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
