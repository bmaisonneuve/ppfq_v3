# Les agrégats s'écrivent avec la partie, et se lisent par une porte à eux

Ce ticket ajoute une table qui compte, et tout ce qu'il a d'inhabituel tient à
une phrase du modèle : **il n'y a pas de job de réconciliation**
(`docs/modele-donnees.md` §5). Un agrégat faux ne se répare donc pas tout seul
la nuit suivante — il reste faux pour toujours, et personne ne le voit. Les
trois décisions ci-dessous en découlent.

## `played_count` s'écrit à l'ouverture, pas à la fin

Le modèle dit deux choses qui se contredisent à la lettre : « cette table est
écrite dans la même transaction que la fin de partie », et « `played_count` :
toute partie ouverte compte ». Les specs §5 tranchent dans le même sens que la
seconde — une partie ouverte compte comme jouée, **même abandonnée** — et une
partie abandonnée n'a par définition pas de fin à laquelle se compter.

Ce compteur-là est donc écrit dans la transaction qui **ouvre** la partie, et
les autres dans celle qui la termine. La règle exacte est « dans la même
transaction que l'écriture qu'elle compte », dont la fin de partie est le cas
le plus visible et non le seul. `openPlay` gagne donc une transaction là où il
n'en avait pas : le `RETURNING` vide d'un `on conflict do nothing` est ce qui
distingue une énigme qu'on ouvre d'une énigme déjà ouverte, et c'est lui qui
décide s'il y a quelque chose à compter.

C'est aussi ce qui rend le dénominateur du taux de réussite honnête : il compte
les journées où le joueur a renoncé, qui sont précisément celles qu'un taux
calculé sur les parties terminées aurait flattées.

## L'upsert est le verrou du carton plein

Le carton plein est « les trois énigmes d'une même grille trouvées », donc il se
constate en comptant les énigmes résolues de la grille au moment où l'une passe
à `solved`. Deux parties du même joueur qui se terminent en même temps — deux
onglets, la file du client contournée — compteraient chacune sans voir ce que
l'autre vient d'écrire : chacune verrait deux énigmes sur trois, et **le carton
plein se perdrait entre les deux transactions**.

`countFinish` commence donc par un `INSERT … ON CONFLICT DO UPDATE` qui ne
change rien. Ce n'est pas une création défensive : c'est un `SELECT … FOR
UPDATE` sur une ligne qui n'existe peut-être pas encore, ce qu'un `SELECT …
FOR UPDATE` seul ne sait pas faire. L'index unique `(player_id, mode)` — que le
modèle demandait pour compter l'archive à part — devient du même coup le point
de sérialisation de tout ce qui compte pour un joueur.

Le comptage lui-même pose **deux** conditions : toutes les énigmes de la grille
trouvées, **et** la grille en a bien trois. Le premier jet n'avait que la
première, en se disant que « trois » était une propriété de l'écran de
programmation et pas du modèle — c'était l'inverse. Les specs §5 comme le
glossaire disent *trois*, et c'est le nombre qui protège : sans lui, une grille
à laquelle il manque une position donne un carton plein à qui en trouve deux,
sur un compteur que le joueur voit. Le total est lu quand même plutôt que
supposé, de sorte que la question posée à la base reste « toutes les énigmes de
cette grille » et que les deux réponses doivent coïncider.

Le carton plein n'est pas filtré par mode, et la série si. Ce n'est pas un
oubli : la ligne d'agrégat est déjà *par* mode, donc un carton plein d'archive
se compte sur la ligne d'archive, « comptée séparément » (specs §7). La série
demande le filtre en plus, parce qu'une suite de dates d'archive ne serait pas
une suite de jours passés — ce serait la liste des grilles qu'on a choisi de
rejouer, et « sinon une série de 200 jours se reconstruit en une soirée ».

## Une reconstruction, une seule, et c'est celle du jour zéro

« Pas de réconciliation » vaut pour la nuit d'après, pas pour le jour où la
table apparaît. Une migration qui se contenterait de créer `player_stats` vide
laisserait les parties déjà ouvertes non comptées, pendant que la première
réussite ferait `solved_count = 1` sur un `played_count` resté à zéro : un taux
de réussite au-dessus de 100 %, que plus rien ne viendrait réparer — c'est la
règle « rien ne se répare tout seul » qui se retourne contre elle-même.

`drizzle/0011_backfill_player_stats.sql` reconstruit donc les quatre compteurs
et la série depuis `player_progress`, une fois, dans la transaction de la
migration. Elle est écrite à la main parce que drizzle-kit ne génère que des
différences de schéma, et `ON CONFLICT DO NOTHING` parce qu'une ligne déjà
présente a été écrite par le jeu lui-même — et que le jeu a raison contre une
reconstruction.

Ce que la suite en affirme n'est pas que la requête est juste dans l'absolu,
c'est que **les deux chemins tombent d'accord** : on fait jouer les services,
on jette la ligne, on rejoue le vrai fichier livré, et les compteurs doivent
revenir identiques. Une divergence entre ce que le jeu compte et ce que la
reconstruction retrouve est exactement le bug que cette table ne sait pas
signaler.

## Les statistiques ont leur propre porte, et c'est le pic qui la justifie

`POST /api/game/stats` est la huitième route, et l'alternative évidente — un
champ de plus sur la réponse de `POST /api/game/state` — a été écartée pour une
raison de charge et une de cadence.

**La charge.** L'état personnel est le chemin du pic : à minuit, la quasi-totalité
de la circulation est une ouverture d'énigme, et l'ADR-0012 tient à ce que cette
requête-là ne lise même pas un nom de footballeur. Lui greffer une lecture
d'agrégat *plus* un `GROUP BY tries_used` sur toute l'histoire du joueur ferait
payer à chaque pli un panneau que la plupart des requêtes n'affichent jamais.

**La cadence.** Un agrégat bouge au plus trois fois par jour, une fois par partie
terminée ; l'état d'une grille est relu à chaque pli. Deux rythmes, deux portes.

C'est un **POST** pour la raison exacte de l'ADR-0009, et elle tient mot pour
mot : cette route crée un joueur quand l'appelant ne présente pas de cookie, et
un GET serait déclenché par un préchargement de lien, un crawler ou un bot
d'aperçu de messagerie — chacun gonflant `players` d'une ligne que la purge
devra reprendre. Elle ne lit aucun corps : le joueur est dans le cookie.

**Elle n'a pas sa propre file côté client**, et c'est la contrepartie à ne pas
perdre. Une requête personnelle hors de la file de `use-day-plays.ts` est un
second joueur qui se crée (ADR-0009) : les statistiques se rangent donc dans la
même file, derrière la requête qui établit l'identité, et sont relues après
chaque essai qui **termine** une partie — le seul qui bouge un agrégat. Trouver
le titulaire fait donc avancer la série sous les yeux du joueur.

## La série est écrite d'un côté et lue de l'autre

`streakAfterTitulaire` est ce qui s'écrit, `displayedStreak` est ce qui se lit,
et la seconde est la remise à zéro. Si elle écrivait, il faudrait quelqu'un pour
la déclencher, donc un job nocturne parcourant tous les joueurs — précisément ce
que le modèle refuse, et pour la même raison que la partie non terminée est lue
comme un échec plutôt qu'écrite à minuit (ADR-0008, `server/domain/play.ts`).

Deux conséquences assumées :

- **`current_streak` en base peut être périmé indéfiniment**, et personne ne le
  répare. C'est `last_solved_challenge` qui porte la vérité ; la valeur stockée
  n'a de sens qu'avec elle, et elle ne sort jamais du serveur — un client qui la
  recevrait aurait une deuxième définition de la série.
- **Un jour manqué fait repartir à 1 et non à 0.** Le jour qu'on est en train de
  gagner compte : repartir à zéro afficherait « série : 0 » à quelqu'un qui vient
  de trouver le titulaire.

La fenêtre de lecture est « aujourd'hui ou hier », et *hier* n'est pas de la
tolérance : la grille du jour n'est pas jouée à minuit, et une série qui
tomberait à zéro entre le réveil et la partie du jour serait fausse toute la
matinée.

## Ce qui n'est pas fait

**La répartition par nombre d'essais n'est pas stockée.** Un `GROUP BY
tries_used` sur les parties résolues du joueur, qui en a au plus trois par jour
(`docs/modele-donnees.md` §9). Six colonnes seraient six copies du même fait, et
la table ne porte que ce qui doit se lire en O(1) ou survivre à la purge des
vieilles parties — le jour où elle arrivera, cette répartition ne portera plus
que sur la période conservée, et c'est écrit dans le modèle.

**Aucune ligne d'agrégat n'est créée par une lecture.** Un joueur qui n'a rien
joué lit des zéros et laisse la table vide : la ligne naît avec la première
partie ouverte.

**`best_streak` est stockée et n'est pas affichée.** Le modèle demande la
colonne (`docs/modele-donnees.md` §5) ; les specs §5 énumèrent ce que le joueur
voit — cartons pleins, parties jouées, répartition, taux — et la meilleure série
n'y est pas. Elle est donc écrite et attend l'écran qui la demandera, plutôt que
d'arriver sur celui-ci sans que rien ne l'ait demandée.

**Aucun test d'interface**, comme l'ADR-0012 le notait déjà : le dépôt n'en a
aucun et ce ticket n'en introduit pas le premier. Ce qui est affirmé sans écran
est ce qui se calcule — le taux, la forme de la répartition — dans
`test/shared/stats.test.ts` ; le panneau lui-même ne calcule rien.

**Rien pour l'archive.** La table est clé par `(player_id, mode)` et le service
prend le mode en argument, mais tout écrit `daily` tant que l'archive n'existe
pas (#11, #14). La série n'avance que dans le quotidien, et c'est la seule règle
de mode déjà écrite : « sinon une série de 200 jours se reconstruit en une
soirée » (specs §7).
