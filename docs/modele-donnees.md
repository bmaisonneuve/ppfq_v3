# Modèle de données

Complément de `specs-jeu-quiz-football.md` (référence fonctionnelle). Remplace le §5 de `stack-technique.md`.
Vocabulaire : `CONTEXT.md`. Identifiants en anglais.

---

## 1. Principe

```
CATALOGUE  ◀──(lecture directe)──  JEU  ◀──(joue)──  JOUEURS
 mutable                        programmation      état de partie
```

Une énigme **désigne** un footballeur du catalogue, elle n'en copie rien. Le parcours affiché, les durées, les matchs, les buts et la nationalité sont lus dans les tables au moment du rendu. Programmer une grille, c'est choisir trois footballeurs et une date.

Conséquence à connaître : un import qui modifie un parcours modifie **toutes** les grilles où ce footballeur apparaît, y compris une grille d'archive et une partie en cours. Voir §11.

---

## 2. Énumérations

Toutes les clés primaires sont des `uuid`. Le thème d'une grille n'est **pas** une énumération : c'est un champ libre.

| Nom | Valeurs |
|---|---|
| `daily_challenge_status` | `draft`, `scheduled`, `published` |
| `play_mode` | `daily`, `archive` |
| `play_status` | `in_progress`, `solved`, `failed` |

---

## 3. Catalogue

### `footballers`

Référentiel de recherche **et** catalogue curé. « Curé » n'est pas un statut : c'est le fait d'avoir des `player_clubs`. Les colonnes de curation sont donc nullables.

Les homonymes sont dédupliqués **à l'import** : sur les 382 703 footballeurs de l'extract, seul celui qui a le plus de `sitelinks` est inséré pour un nom donné. Les 13 042 autres n'entrent pas en base. Récupérer un homonyme notable est une insertion manuelle. À `sitelinks` égal, c'est le plus petit numéro Wikidata qui gagne — un départage arbitraire mais **déterministe**, sans lequel relancer l'import pourrait échanger deux footballeurs qui partagent un nom et une notoriété.

Cette insertion manuelle, c'est l'**import de parcours par Q-id** : si le footballeur n'est pas en base, l'ingest crée sa ligne — et ses termes de recherche dans la même transaction, faute de quoi il serait un footballeur que personne ne peut taper, donc que personne ne peut proposer. Il faut alors que la source le nomme : sans libellé français ni anglais, l'import refuse plutôt que d'insérer une ligne anonyme. `name` et `sitelinks` d'une ligne existante appartiennent en revanche à l'import du référentiel, et l'ingest n'y touche pas.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `wikidata_qid` | text | Unique, nullable — null si saisi à la main |
| `name` | text | Nom canonique affiché |
| `wiki_fr_url` | text | Nullable. Lien ouvert par l'admin à chaque curation |
| `wiki_en_url` | text | Nullable |
| `sitelinks` | integer | Nombre d'éditions Wikipédia. **Classement de recherche uniquement**, jamais affiché, jamais utilisé pour la difficulté |
| `nationality_id` | uuid | → `nationalities.id`. Nullable, mais **requis pour programmer**. Une seule, la nationalité sportive |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `nationalities`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `code` | text | Unique. ISO 3166-1 alpha-2 quand le pays en a un, sinon voir ci-dessous |
| `fr_name` | text | Nom affiché par le jeu |
| `en_name` | text | Nullable |
| `flag_key` | text | Nullable. → `nationality_flags.key`. **Clé**, jamais une URL |

**Le code n'est pas toujours un alpha-2**, et c'est le football qui l'impose. La chaîne est `P297` (alpha-2), puis `P300` (subdivision ISO 3166-2), puis `P298` (alpha-3) :

- les **quatre nations britanniques** n'ont aucun alpha-2 et sont précisément la raison pour laquelle la nationalité sportive prime sur la citoyenneté — Beckham est `P27` Royaume-Uni et `P1532` Angleterre. Elles entrent en `GB-ENG`, `GB-SCT`, `GB-WLS`, `GB-NIR` ;
- les **pays disparus**, dont les joueurs sont exactement ceux qu'une grille rétro veut, ne gardent qu'un alpha-3 : `YUG`, `CSK`, `SUN`.

Un pays qui n'a aucun des trois codes n'entre pas en base : le footballeur reste sans nationalité, donc non programmable, et l'import le signale. La colonne reste une clé naturelle unique ; ce qu'elle n'est plus, c'est strictement de l'alpha-2.

### `nationality_flags`

| Colonne | Type | Description |
|---|---|---|
| `key` | text | Clé primaire. **SHA-256 des `bytes`**, en hexadécimal minuscule |
| `bytes` | bytea | L'image elle-même |
| `content_type` | text | `image/webp` pour tout ce que le seed produit |
| `byte_size` | integer | |
| `source_file` | text | Nullable. `flag-icons/fr.svg`, `scripts/flags/yug.svg` |
| `license` | text | Nullable. `flag-icons (MIT)`, `domaine public (Wikimedia Commons)` |
| `created_at` | timestamptz | |

**La clé est l'adresse du contenu**, et c'est ce qui fait tenir le reste : deux nationalités au drapeau identique partagent la ligne (mesuré : 274 nationalités pour 260 lignes), remplacer un drapeau écrit une clé *différente* donc une URL différente, et la route de lecture peut promettre `immutable` sans rien à invalider. Les octets sont servis par `/api/flags/<key>`, jamais inlinés dans une page.

**Les octets sont en base et pas dans un bucket** : 491 Ko pour l'ensemble des drapeaux, à comparer aux 15-20 Go/an de `player_progress` (§9). Postgres sort de lui-même un `bytea` de plus de 2 Ko en TOAST, donc une requête qui ne lit pas la colonne ne la paie pas. Un magasin d'objets apporterait un compte, des clés, un service de développement et surtout une **deuxième histoire de sauvegarde**, alors que la procédure doit rester « restaurer Postgres ».

**Table à part plutôt qu'une colonne sur `nationalities`** : `catalogue.service.ts` lit une nationalité en `select({ nationality: nationalities })`, donc toutes ses colonnes. Un `bytea` posé là voyagerait avec chaque lecture de parcours, au bénéfice du seul écran qui affiche une image.

**D'où viennent les images** : le paquet `flag-icons` (MIT), dont le jeu de codes est exactement celui que produit la chaîne ci-dessus — alpha-2, plus `gb-eng`, `gb-sct`, `gb-wls`, `gb-nir`, et `gb-nir` sous l'Ulster Banner, la convention du football. Les trois pays disparus lui sont inconnus et vivent en SVG dans `scripts/flags/`. Wikidata `P41` a été écarté : voir ADR-0011.

**La nationalité est choisie, jamais devinée** : `P1532` (« pays pour le sport ») s'il y en a un seul, sinon `P27` s'il y en a une seule, sinon rien. Un binational sans `P1532` est exactement le cas qu'aucune règle ne tranche, et l'indice 3 tombe au milieu d'une partie : un footballeur qu'il reste à curer est un footballeur non programmable, un mauvais drapeau est une énigme fausse. Une ligne existante n'est **jamais réécrite** par un import — son nom français et son drapeau sont curés — et la nationalité d'un footballeur n'est jamais effacée, seulement renseignée.

### `footballer_names`

Noms canoniques et 225 886 alias Wikidata fusionnés : le typeahead est **une requête**, pas une union. Les alias entrent dans l'index et jamais dans l'affichage.

S'y ajoutent les **mots après le premier** de chaque nom, indexés comme des termes à eux seuls — 1 086 801 lignes en tout. Sans eux un nom de famille n'est pas tapable : l'index de préfixe est ancré au début d'un terme, et Wikidata ne livre un alias « Papin » que pour 28 % des footballeurs multi-mots assez notoires pour être programmés (802 sur 2 890, mesuré le 2026-09-09). Les trigrammes ne comblent pas le trou, puisqu'ils ne sont interrogés que quand le préfixe n'a **rien** trouvé, alors que « papin » trouve trois homonymes obscurs et s'arrête là. Le premier mot n'a pas sa ligne : un préfixe du terme entier le couvre déjà.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `footballer_id` | uuid | → `footballers.id`, cascade |
| `term` | text | Normalisé : minuscules, sans accents |
| `is_canonical` | boolean | `false` = alias, jamais affiché |

### `clubs`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `wikidata_qid` | text | Unique, nullable |
| `fr_name` | text | Nom **actuel** en français. C'est celui qu'affiche le jeu |
| `en_name` | text | Nom actuel en anglais. Nullable, sert de repli et de recherche pour l'admin |
| `logo_s3_key` | text | Nullable. **Clé** de l'objet S3, pas une URL complète : le domaine du bucket ou du CDN doit pouvoir changer sans réécrire la table |

Un club renommé au point d'être méconnaissable est une autre ligne : on ne modélise pas la succession.

### `player_clubs`

Un passage senior. Les **sélections nationales** sont filtrées à l'import de façon fiable (`P279* Q6979593`, recoupement nul avec les clubs) et la carrière jeunes est quasi absente de P54. Les **équipes réserve, en revanche, ne sont pas détectables** : les trois signaux disponibles (type *reserve team*, lien vers le club parent, libellé en « II / B / C / Jong ») ne couvrent que 1,4 à 1,6 % des passages — FC Barcelona C n'est pas typé réserve — et le signal du club parent produit des faux positifs. Elles entrent donc déguisées en clubs seniors et sont **supprimées à la main à la curation**, l'éditeur les pré-signalant par heuristique de libellé sans jamais supprimer seul. Les années viennent de Wikidata et **peuvent se chevaucher** (un prêt coexiste avec le contrat parent) : la somme des durées peut dépasser la carrière, c'est assumé.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `footballer_id` | uuid | → `footballers.id`, cascade |
| `club_id` | uuid | → `clubs.id` |
| `is_loan` | boolean | Simple annotation, jamais un club à part |
| `start_year` | integer | Année de début. Porte aussi l'ordre d'affichage |
| `end_year` | integer | Nullable = carrière en cours |
| `matches` | integer | Nullable, mais requis pour programmer. **Matchs de championnat uniquement** : c'est ce que compte la source (`P1350`), coupes et compétitions européennes exclues |
| `goals` | integer | Nullable, mais requis pour programmer. Buts de championnat uniquement (`P1351`) |

Pas de colonne d'ordre : le parcours se trie par `(start_year, end_year, id)`. La date de début n'étant jamais affichée, son imprécision est sans conséquence — mais le tri doit inclure `id` pour être **déterministe**, sinon deux passages commençant la même année pourraient s'afficher dans un ordre différent d'un chargement à l'autre, alors que l'ordre des clubs fait partie de l'énigme. Le cas typique est un prêt commençant l'année du contrat parent ; le seul moyen de corriger l'ordre est alors d'ajuster les années.

Durée affichée au joueur : `end_year - start_year + 1`. 2015-2015 = 1 saison, 2015-2016 = 2 saisons. Approximation assumée, calculée **au rendu** comme tout le reste de l'énigme (§1) : rien n'est copié à la programmation. Une carrière en cours voit donc sa durée grandir, y compris sur une grille d'archive.

## 4. Jeu

### `daily_challenges` — la grille

Une ligne par date programmée. **L'absence de ligne est le trou** que `schedule_check_gaps` détecte.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `date` | date | **Unique**. Date Europe/Paris, pas un timestamp |
| `theme` | text | Champ libre, `standard` par défaut. Sous la responsabilité de l'admin |
| `status` | enum | `draft` par défaut |
| `published_at` | timestamptz | Nullable |

Le thème vit ici parce qu'il qualifie la journée entière, jamais une énigme seule. Il est libre plutôt qu'énuméré et **aucun contrôle automatique ne s'y rattache** : n'importe quel thème peut être posé n'importe quel jour, un vendredi peut être classique, et c'est à l'admin de garantir la cohérence entre le thème annoncé et les trois footballeurs choisis. L'écran de programmation propose les valeurs déjà utilisées, sans les imposer.

### `challenge_items` — l'énigme

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `daily_challenge_id` | uuid | → `daily_challenges.id`, cascade |
| `position` | integer | 1 échauffement, 2 titulaire, 3 légende. Unique avec `daily_challenge_id` |
| `footballer_id` | uuid | → `footballers.id`. La réponse |
| `created_at` | timestamptz | |

Une énigme n'est qu'une **désignation** : trois colonnes utiles. Tout ce que voit le joueur est lu à la volée dans `player_clubs`, `clubs` et `footballers` :

| Palier | Source |
|---|---|
| Parcours, prêts, ordre | `player_clubs` triés par `start_year`, `clubs.fr_name` |
| 1 — décennie de début | `min(player_clubs.start_year)` arrondi à la décennie |
| 2 — durée par club | `end_year - start_year + 1` |
| 3 — nationalité | `footballers.nationality_id` → `nationalities` |
| 4 — matchs **en championnat** par club | `player_clubs.matches` |
| 5 — buts **en championnat** par club | `player_clubs.goals` |

**Contrôle avant programmation** : l'admin ne peut pas programmer une énigme dont un passage n'a pas ses matchs et ses buts, ou dont la nationalité manque — un palier vide casserait le jeu après quatre essais déjà consommés. S'y ajoutent trois prédicats de vraisemblance, mesurés comme fréquents dans la source : `goals <= matches` (2 989 passages violent la règle), `end_year >= start_year` (181 cas) et `start_year >= 1880` (131 cas). Rien n'est rejeté à l'import — le référentiel de recherche reste exhaustif et un footballeur aux données douteuses reste une suggestion valide, il devient simplement non programmable. C'est un contrôle au moment de la programmation, **pas une garantie dans le temps** : rien n'empêche un import ultérieur de vider un champ d'une énigme déjà publiée.

Et surtout, **ce contrôle teste la complétude des champs, pas l'exactitude du parcours**. Les deux sont différentes : la mesure du 2026-09-09 (`docs/research/wikidata-coverage.md`) trouve qu'au moins 21,5 % des carrières dont *tous* les passages sont renseignés ont un trou de deux ans ou plus, donc un club purement absent — Cantona a ses sept passages complets et l'OM 1988-1991 n'existe pas dans Wikidata, ce qui laisse ses trois prêts rattachés à rien. Une telle énigme n'est pas plus difficile, elle est fausse. Aucune requête ne le détecte ; le seul garde-fou est le coup d'œil de l'admin quand il ajoute le footballeur à une grille. **Il n'est ni tracé ni exigé par le modèle, et c'est assumé** : pas de `verified_at`, pas de statut de curation.

### `player_progress` — la partie

Une ligne par `(challenge_item, player)`, créée **à l'ouverture de l'énigme**, pas au premier essai.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `challenge_item_id` | uuid | → `challenge_items.id`, cascade. Unique avec `player_id` |
| `player_id` | uuid | → `players.id`, cascade |
| `mode` | enum | `daily` ou `archive` |
| `tries_used` | integer | 0 à 6. **Tout consomme un essai** : mauvaise réponse, footballeur déjà proposé, tour passé |
| `status` | enum | `in_progress` par défaut |
| `opened_at` | timestamptz | |
| `finished_at` | timestamptz | Nullable |
| `last_guess_footballer_id` | uuid | Nullable. **Anti-double-clic, pas une règle de jeu** |
| `last_guess_at` | timestamptz | Nullable. Une proposition identique dans les 2 s est ignorée |

Conséquence de la création à l'ouverture : les trois énigmes ne doivent pas être toutes dépliées au chargement, sinon les trois parties naissent d'un coup.

Une partie non terminée avant le changement de grille compte comme un **échec**, par **règle de lecture** et non par un job : une partie `in_progress` dont la grille n'est plus celle du jour est lue comme échouée. Un job de minuit tomberait pile au pic de trafic. Corollaire : une grille du jour non terminée ne se reprend pas le lendemain, elle bascule en archive.

---

## 5. Joueurs

### `players`

Un joueur est une ligne, avec ou sans compte. La reprise de progression est un `UPDATE` d'une colonne, pas une migration de données.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire. Référencée partout |
| `cookie_id` | text | Unique. Identité anonyme |
| `auth_user_id` | text | Unique, nullable. Better Auth, renseigné à l'inscription |
| `created_at` | timestamptz | |
| `last_seen_at` | timestamptz | Sert la purge |

Ce rôle n'est **pas** confié à la table `user` de Better Auth. Le plugin `anonymous` ferait le travail, mais il ouvre une session d'authentification par visiteur (180 jours d'expiration, des dizaines de millions de lignes pour des gens venus une fois) et **supprime la ligne anonyme après liaison** par défaut — ce qui effacerait la progression qu'on voulait reprendre.

Purge : sans compte, sans partie, non revu depuis **13 mois** — la durée de vie du cookie d'identité anonyme (§10).

### `player_stats`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `player_id` | uuid | → `players.id`, cascade. **Unique** avec `mode` |
| `mode` | enum | L'archive est comptée séparément (specs §7) |
| `played_count` | integer | Toute partie ouverte compte |
| `solved_count` | integer | |
| `perfect_challenges` | integer | Cartons pleins |
| `current_streak` | integer | |
| `best_streak` | integer | |
| `last_solved_challenge` | date | Nullable. Sert la remise à zéro de la série |

La **série est stockée mais remise à zéro à la lecture** : si `last_solved_challenge` n'est ni aujourd'hui ni hier, la série affichée vaut 0. « Le joueur n'est pas venu hier » est une absence, et une absence ne déclenche rien — sans cette règle il faudrait un job nocturne parcourant tous les joueurs.

La répartition par nombre d'essais (specs §5) n'est pas stockée : c'est un `GROUP BY tries_used` sur les `player_progress` résolues du joueur, qui en a au plus trois par jour.

Il n'y a **pas** de job de réconciliation : cette table est écrite dans la **même transaction** que la fin de partie. Conséquence à connaître : un agrégat faux ne se répare pas tout seul la nuit suivante, donc cette écriture est à couvrir par les tests comme une règle de jeu, pas comme un détail. Ce qui vit ici est ce qui doit être lu en O(1) ou survivre à une purge — le jour où les vieilles `player_progress` seront purgées, la répartition par nombre d'essais ne portera plus que sur la période conservée.

### `pending_claims`

Reprise de progression quand le lien magique s'ouvre dans un autre navigateur que celui où l'on jouait.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `email` | text | |
| `player_id` | uuid | → `players.id`, cascade |
| `expires_at` | timestamptz | |

---

## 6. Exploitation

### `email_events`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `email` | text | |
| `type` | text | `bounce`, `complaint`, `delivered` |
| `provider_id` | text | Nullable |
| `created_at` | timestamptz | |

### `job_runs`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `job` | text | |
| `target` | text | Nullable. Ce que la course a traité : le Q-id du footballeur pour un import de parcours |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | Nullable — la course n'a jamais rendu compte |
| `items` | integer | Nullable. Volume traité : passages écrits, pour un import |
| `errors` | integer | Nullable |
| `last_error` | text | Nullable. Le message rendu à l'appelant, tronqué — jamais une pile |

`target` et `last_error` s'ajoutent au premier jet du modèle. `target` parce que l'import tourne pour **un** footballeur à la fois : une ligne « career_import, 7 items » ne dit rien à l'écran de diagnostic. `last_error` parce que `errors = 1` dit qu'une course a échoué et laisse l'écran sans rien à montrer, alors qu'un import refusé — mauvais Q-id, carrière sans club — est justement la course qu'on vient lire. La ligne est écrite **hors** de la transaction qu'elle décrit, et à la sortie comme à l'entrée : une course qui a échoué et n'a rien laissé derrière elle est justement celle qu'on vient lire, un rollback ne doit pas emporter sa trace.

---

## 7. Index

| Table | Index | Pourquoi |
|---|---|---|
| `footballer_names` | btree `text_pattern_ops` sur `term` | Recherche par préfixe dès 2 caractères — le cas dominant du typeahead |
| `footballer_names` | GIN trigrammes sur `term` | Tolérance aux fautes. Les trigrammes seuls sont mauvais sur les préfixes courts, d'où les deux index |
| `footballer_names` | unique `(footballer_id, term)` | Un seul terme par footballeur : c'est ce qui rend l'import idempotent et ce qui fait fusionner les variantes d'accent que Wikidata livre (« Zinédine Zidane » et « Zinedine Zidane » sont un seul terme). Mené par `footballer_id`, il sert aussi la jointure et le cascade, d'où l'absence d'index séparé sur cette colonne |
| `footballers` | `(sitelinks` décroissant`, name, id)` | Classement des résultats. Les trois colonnes, et `NULLS FIRST` : c'est exactement ce que le typeahead demande en `ORDER BY`, donc Postgres parcourt le référentiel dans l'ordre du classement et s'arrête au dixième résultat. Amputé d'une colonne, ou déclaré `NULLS LAST`, il agrège les 28 000 noms qui commencent par « ma » et les trie — 117 ms mesurés sur l'extract réel, contre 0,8 ms. `name` et `id` ne servent qu'à rendre une égalité de notoriété reproductible d'une frappe à l'autre |
| `footballers` | `nationality_id` | Jointure de l'indice 3 |
| `nationalities` | unique `code` | Clé naturelle ISO |
| `player_clubs` | `(footballer_id, start_year, end_year)` | Reconstitution ordonnée du parcours, lue à chaque rendu d'énigme |
| `daily_challenges` | unique `date` | Une grille par date |
| `challenge_items` | unique `(daily_challenge_id, position)` | Trois énigmes par grille, une par position |
| `player_progress` | unique `(challenge_item_id, player_id)` | Une seule ligne par joueur et par énigme : c'est de l'état, pas un journal |
| `player_progress` | `(player_id, opened_at` décroissant`)` | Historique et statistiques personnelles |
| `player_stats` | unique `(player_id, mode)` | Un agrégat par joueur et par mode |
| `players` | `last_seen_at` | Purge |
| `job_runs` | `(job, started_at` décroissant`)` | Diagnostic |

---

## 8. Le cycle d'une partie

| Palier | `tries_used` | Visible |
|---|---|---|
| Départ | 0 | Clubs ordonnés, prêts annotés |
| 1 erreur | 1 | + décennie de début de carrière |
| 2 erreurs | 2 | + durée par club, en saisons |
| 3 erreurs | 3 | + nationalité |
| 4 erreurs | 4 | + matchs en championnat par club |
| 5 erreurs | 5 | + buts en championnat par club |
| 6 erreurs | 6 | Fin de partie, réponse révélée |

Un tour **passé** compte comme une erreur. Sans cela, six clics donneraient tous les indices gratuitement.

La saisie est une **sélection dans une liste** : un essai est un `footballer_id`, jamais du texte libre. Le résultat renvoyé au client n'a donc que trois formes :

| Statut | Contenu | Quand |
|---|---|---|
| `correct` | essais consommés + révélation complète | Bonne réponse |
| `wrong` | essais consommés + **un seul** indice, le suivant | Mauvaise réponse, doublon, ou tour passé |
| `exhausted` | révélation complète | 6ᵉ erreur |

Le serveur ne renvoie jamais la liste complète des indices ni la réponse avant la fin. Conséquence sur le cache : la coquille partagée et cachable pleine page se limite au **parcours** (clubs, ordre, prêts, position, thème), reconstruit depuis les tables une fois par jour ; les indices dévoilés et l'état de partie sont dynamiques. Mettre les cinq indices dans le HTML de la page cachée les rendrait lisibles dans la source.

D'où le découpage acté côté rendu : la page de la grille **ne lit aucun cookie**, donc elle ne connaît aucun joueur et reste statique ; l'état de partie est chargé par une requête dédiée après l'hydratation. Voir `stack-technique.md` §10.

Le **résumé partagé n'est pas stocké** : il se dérive des trois `player_progress` d'une grille. Garde-fou d'interface : on ne propose le partage que si au moins une partie a été jouée, sinon une grille simplement ouverte produirait un résumé de trois échecs.

---

## 9. Ce qui n'est pas stocké

| Écarté | Raison |
|---|---|
| `game_events`, une ligne par essai | ~450 M lignes/an pour un retour que `player_progress` donne déjà. Fait tomber le partitionnement mensuel, l'archivage S3 et ~100 Go/an prévus au doc technique |
| Le texte brut des essais | Il n'y en a plus : la saisie est une sélection |
| La liste des footballeurs proposés | Le doublon consomme un essai, il n'y a rien à détecter |
| Une table d'alias curée à la main | Les 225 886 alias Wikidata sont importés dans `footballer_names` |
| Une file de validation des diffs Wikidata | L'import écrit directement sur le footballeur |
| Jeunes et sélections nationales | Filtrés à l'import, hors périmètre du parcours. Les **réserves** ne sont pas filtrables automatiquement : elles sont retirées à la main à la curation (§3) |
| Le résumé partagé | Dérivable des trois `player_progress` |
| La répartition par nombre d'essais | Un `GROUP BY tries_used` sur les `player_progress` résolues |
| Le parcours figé (`career_snapshot`, `hints`) | Une énigme désigne un footballeur, elle ne copie rien. Le parcours est lu dans les tables à chaque rendu |
| `skips_used` | Un tour passé est un essai comme un autre, `tries_used` suffit |

---

## 10. Décisions actées

| Décision | Raison |
|---|---|
| `daily_challenges` séparé de `challenge_items` | Thème, carton plein et remplacement hors-série sont des faits de journée, pas de slot |
| Énigme lue à la volée dans le catalogue | Une énigme est une désignation, pas une copie. Simplifie le modèle et l'admin, au prix d'une exposition du jeu aux mouvements du catalogue |
| Aucun contrôle automatique sur le thème | N'importe quel thème n'importe quel jour ; la cohérence est de la responsabilité de l'admin |
| Recherche avec sélection | L'extract quasi exhaustif lève l'objection des specs §10.1 |
| `sitelinks` conservé | Sans classement par notoriété, `Zidane` place Zinedine en 15ᵉ position et `Henry` noie Thierry parmi 502 lignes |
| Homonymes dédupliqués à l'import, perdants non insérés | Une liste de suggestions sans ambiguïté. Récupérer un homonyme notable est une insertion manuelle |
| `footballer_names` unifiée, deux index | Une requête au lieu d'une union ; les trigrammes sont mauvais sur les préfixes courts |
| L'import d'un parcours **remplace** tous les passages du footballeur | Un parcours est ce que la source en dit, pas un empilement de deux imports. Contrepartie assumée : une réserve retirée à la main revient, et c'est la raison pour laquelle l'import est un acte volontaire sur un footballeur et jamais un job nocturne |
| Trois refus à l'import, et rien d'autre | Pas un footballeur (`P106`), aucun passage en club, footballeur inconnu du référentiel et sans libellé. Chacun protège de la donnée curée contre une réponse maigre — un snapshot en cours d'édition ne doit pas vider un parcours |
| Nationalité sportive : `P1532`, sinon une citoyenneté unique, sinon rien | L'indice 3 tombe au milieu d'une partie : un mauvais drapeau est une énigme fausse, un footballeur non curé est seulement non programmable |
| Dédoublonnage `(footballer, club, start_year)` à l'import | 6 721 groupes de doublons dans la source. Un doublon fait apparaître deux fois le même club dans un parcours, ce qui **ressemble exactement à un vrai double passage** et devient indétectable à l'œil : c'est le seul nettoyage que la curation ne peut pas rattraper. La déclaration la mieux qualifiée est conservée |
| Incohérences de la source bloquées à la programmation, pas à l'import |  `goals <= matches`, `end_year >= start_year`, `start_year >= 1880`. Trois prédicats SQL, aucun rejet à l'entrée |
| Matchs et buts = championnat seulement | C'est ce que comptent `P1350`/`P1351`. L'énoncé des paliers 4 et 5 le dit explicitement au joueur (specs §3) |
| Années Wikidata brutes, chevauchements autorisés | Pas de reconstruction de vérité. Pas de colonne d'ordre : tri déterministe par `(start_year, end_year, id)` |
| Durée calculée au rendu | `end_year - start_year + 1`. Une carrière en cours voit donc sa durée grandir, y compris sur une grille d'archive |
| Complétude contrôlée à la programmation | Un palier vide casse le jeu après quatre essais consommés. Contrôle ponctuel, pas garantie dans le temps |
| Aucun statut de vérification (`verified_at` écarté) | « Curé » reste le fait d'avoir des `player_clubs`. Contrepartie assumée : un parcours peut être complet **et faux par omission**, et rien dans le modèle ne l'empêche d'être programmé (§4) |
| Nationalité en table étrangère, unique par footballeur | Nom localisé et drapeau partagés ; un binational rendrait l'indice trompeur |
| Drapeaux en base, adressés par le SHA-256 de leurs octets | 491 Ko pour tout le jeu ; la sauvegarde reste « restaurer Postgres », et l'adresse-contenu rend `immutable` honnête |
| Drapeaux tirés de `flag-icons`, pas de Wikidata `P41` | `P41` est multivalué et historique : dix drapeaux pour la France, aucun pour l'Irlande du Nord. Voir ADR-0011 |
| Table `players` propre | Évite une session d'auth par visiteur et la suppression automatique de la ligne anonyme à la liaison |
| `player_progress` créée à l'ouverture | Mesure les gens exposés, ce que le calibrage de difficulté demande |
| Non terminée = échec, par règle de lecture | Pas de job de minuit, qui tomberait au pic de trafic |
| Tout consomme un essai, y compris passer | Sinon les indices sont gratuits. Un tour passé n'est pas distingué d'une erreur |
| Anti-double-clic distinct de la règle du doublon | Depuis que le doublon coûte, un double-clic coûterait deux essais |
| Série stockée, remise à zéro à la lecture | Une absence ne déclenche rien |
| `player_stats` unique `(player_id, mode)` | L'archive est comptée séparément |
| Thème de grille en champ libre | Ouvrir un format ne doit pas demander de migration |
| Logo de club en clé S3, pas en URL | Le domaine du bucket ou du CDN doit pouvoir changer sans réécrire la table |
| Blasons de clubs affichés | Risque juridique évalué et **accepté**. `logo_s3_key` est conservée et destinée à servir |
| Cookie d'identité anonyme strictement nécessaire, 13 mois glissants | Il ne sert qu'à fournir le service demandé (retrouver sa partie) : pas de bandeau de consentement, et donc **aucun traceur analytique à cookie** sur le site. La purge de `players` s'aligne sur cette durée |
| Résumé partagé jamais stocké, pas d'image OG en v1 | L'image OG dynamique est la seule fonctionnalité qui demanderait un identifiant de résumé en base |

---

## 11. Reporté

| Sujet | État |
|---|---|
| Mouvement du catalogue sous une grille vivante | **Assumé, et sans garde-fou** : ni gel, ni avertissement dans l'admin. L'import écrit directement et l'énigme lit les tables, donc un transfert ajouté fait passer une grille de 5 à 6 clubs, y compris pendant une partie et sur une grille d'archive. Exposition fortement réduite par l'absence d'import automatique : c'est l'admin qui déclenche l'import d'un footballeur, rien ne se réécrit la nuit. Jugé sans gravité au regard du coût d'un mécanisme de protection. Parades disponibles le jour où ça gênerait : geler les footballeurs ayant une grille programmée, ou ne rejouer l'import que sur ceux jamais utilisés |
| Partitionnement mensuel de `player_progress` | ~300 000 lignes/jour **à la cible**, quelques centaines au lancement. Réexaminé le 2026-09-09 et confirmé : on ne partitionne **pas** à la création, ça compliquerait requêtes et migrations pendant un ou deux ans pour un seuil peut-être jamais atteint. Premier ticket du jour où le volume décolle, avant ~100 M de lignes |
| Purge des joueurs anonymes | Règle arrêtée, job à écrire |
| Rafraîchissement de `sitelinks` | Ponctuel, aucune fréquence arrêtée |
| Image OG dynamique du résumé | **Écartée en v1** : c'est la seule fonctionnalité qui demanderait un identifiant de résumé stocké. À reprendre si le partage prend |
