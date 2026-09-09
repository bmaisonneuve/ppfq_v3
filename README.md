# PPFQ

Le quiz quotidien des parcours footballistiques. Trois footballeurs à identifier
par jour, à partir de leur parcours en clubs.

- **Vocabulaire** : [`CONTEXT.md`](./CONTEXT.md) — grille, énigme, passage, partie, série.
- **Fonctionnel** : [`docs/specs-jeu-quiz-football.md`](./docs/specs-jeu-quiz-football.md)
- **Modèle de données** : [`docs/modele-donnees.md`](./docs/modele-donnees.md) — source de vérité, prime sur tout le reste.
- **Technique** : [`docs/stack-technique.md`](./docs/stack-technique.md)
- **Décisions** : [`docs/adr/`](./docs/adr/)

## Vocabulaire dans le code

Les identifiants sont en anglais (`docs/modele-donnees.md`) et reprennent le nom
de la table quand il y en a une : un **passage** est un `PlayerClub`, d'après
`player_clubs`. Un **parcours** n'a pas de table, il est donc nommé depuis le
glossaire : `FootballerCareer`, et non `PlayerCareer` — `CONTEXT.md` signale
`player` comme le mot ambigu pour *footballeur*, et `players` est la table des
gens qui jouent au jeu.

## Prérequis

Node 24+, Docker (avec Compose), et pnpm via corepack :

```sh
corepack enable pnpm
```

## Démarrer

```sh
pnpm install
cp .env.example .env.local
pnpm db:up          # lève Postgres et attend qu'il réponde
pnpm db:migrate     # applique les migrations de drizzle/
pnpm db:import-referential   # charge les 382 703 footballeurs de .data/ (~50 s)
pnpm dev            # http://localhost:3000
```

Sans l'import, la barre de recherche répond correctement — elle ne trouve
simplement personne.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm build` / `pnpm start` | Build de production standalone, puis serveur |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, **y compris la règle de layering** |
| **`pnpm test`** | **Toute la suite. Lève le Postgres de test et le migre lui-même : un seul appel, rien à préparer.** |
| `pnpm test:fast` | `domain` + `architecture` — pas de Docker, ~1,5 s |
| `pnpm test:db` | Ce qui a besoin d'un vrai Postgres |
| `pnpm test:watch` | La suite en watch |
| `pnpm db:generate` | Génère le SQL depuis le schéma Drizzle, à relire et committer |
| `pnpm db:import-referential` | Charge le référentiel de recherche depuis `.data/`. Idempotent : le relancer ne duplique rien |

Il n'y a **pas** de `db:push`. Les migrations sont générées, relues par un humain
et committées (`docs/stack-technique.md` §11).

## Services locaux

`docker-compose.yml` porte deux Postgres :

| Service | Port | Données |
|---|---|---|
| `postgres` | 5432 | Base de développement, volume nommé, persistante |
| `postgres-test` | 5433 | Base de test, **tmpfs et `fsync=off`** — jetable et rapide |

`POSTGRES_PORT` et `POSTGRES_TEST_PORT` déplacent les ports si 5432/5433 sont pris.

## Architecture

```
src/
  app/        routage + rendu. Aucune logique métier.
  server/     le back. Chaque fichier : import 'server-only'.
    db/       schéma Drizzle + client. Personne d'autre n'y touche.
    domain/   règles pures. Zéro DB, zéro service, zéro import Next.
    services/ cas d'usage + transactions. LA SEULE PORTE D'ENTRÉE.
  ui/         composants présentationnels
  shared/     isomorphe : types, schémas Zod, formatters
scripts/      outillage Node : migrations, import et extraction du référentiel
test/
  domain/       le seam pur
  shared/       le seam pur aussi : la couche isomorphe
  architecture/ les garde-fous : layering, marqueur server-only
  services/     le seam principal, contre un vrai Postgres
  database/     schéma, index et outillage — rien qui appelle un service
  fixtures/     les jeux de données partagés
  setup/        harnais de base de test
```

**La règle** : `app/` et `server/jobs/` ne peuvent importer que `services/` et
`shared/`. Jamais `db/`, jamais `domain/`.

Elle est écrite comme une **liste blanche** et non comme une liste noire : un
`server/ingest` (#4) ou un `server/auth` (#8) sera gardé le jour où il est créé,
sans que personne ait à revenir dans `eslint.config.mjs`.

Deux barrières, pas une :

1. `import 'server-only'` en tête de chaque fichier de `server/` — **le build
   casse** si un composant client le tire. Une seule exception :
   `db/schema.ts`, que drizzle-kit lit depuis du Node nu. Tout le reste de
   l'outillage qui doit tourner sous Node nu vit dans `scripts/`, hors de `src/`.
2. `import/no-restricted-paths` dans `eslint.config.mjs` — **la CI refuse** le
   raccourci.

Les deux barrières sont elles-mêmes testées (`test/architecture/`) : supprimer
la règle ESLint fait échouer la suite, et oublier `server-only` sur un nouveau
fichier de `server/` aussi.

## Tests

Ce qui fait un bon test ici : il appelle un service comme le ferait
l'application, contre un vrai Postgres, et n'affirme que du comportement
observable. Aucun test ne compte les requêtes SQL, aucun ne remplace Postgres
par un double — la moitié des décisions du projet vivent dans le schéma, les
contraintes d'unicité et les index.

Trois projets Vitest :

- **`domain`** — fonctions pures, rien à démarrer, quelques millisecondes.
  Réservé aux matrices de cas larges : échelle de dévoilement, calendrier
  Europe/Paris, ordre du parcours, normalisation d'un terme de recherche.
  `test/shared/` y est rattaché : la couche isomorphe est pure aussi.
- **`architecture`** — pas des tests du produit, des tests des garde-fous qui le
  tiennent honnête. Ne lisent que la config ESLint et l'arborescence.
- **`postgres`** — tout ce qui a besoin d'un vrai Postgres : le seam principal
  (`test/services/`) et les contrôles de schéma (`test/database/`). Une base
  partagée par la suite, vidée entre chaque test, fichiers exécutés
  séquentiellement. Le jour où c'est lent, on donne une base à chaque worker :
  le changement tient dans `test/setup/`.

### Le jeu de données

`test/fixtures/catalogue.ts` porte cinq footballeurs, un par forme que la source
produit réellement (`docs/research/wikidata-coverage.md`). Un ticket qui a besoin
de catalogue part de là plutôt que d'inventer ses lignes.

| Profil | Ce que c'est |
|---|---|
| `complete` | Curé et programmable : nationalité, matchs et buts partout |
| `incomplete` | Pas de nationalité, et un passage sans matchs ni buts |
| `duplicatePassage` | Le même `(footballeur, club, année de début)` deux fois |
| `untypedReserve` | Une équipe réserve que la source ne type pas, plus un passage en cours |
| `loan` | Un prêt qui chevauche le contrat parent, tous deux la même année |

`test/fixtures/search.ts` ajoute trois footballeurs par-dessus, pour ce que le
classement d'une liste de suggestions demande et que les cinq profils ne disent
pas : un alias à retrouver, et deux homonymes que la notoriété et l'alphabet
départagent en sens contraire.

## Le référentiel de recherche

La saisie est une **sélection dans une liste**, jamais du texte libre : un essai
est un `footballerId`. Les 382 703 footballeurs et 225 886 alias de `.data/`
entrent en base par `pnpm db:import-referential`, dont 13 042 homonymes qui
n'entrent **pas** — pour un nom donné, seul le plus notoire est retenu, et
récupérer un homonyme notable est une insertion manuelle.

Noms canoniques et alias vivent dans une **seule** table (`footballer_names`), la
recherche est donc une requête et pas une union. Les alias entrent dans l'index
et jamais dans l'affichage : une suggestion porte toujours `footballers.name`.

Chaque **mot après le premier** d'un nom y entre aussi comme un terme à lui seul,
sinon un nom de famille n'est pas tapable : l'index de préfixe est ancré au début
d'un terme, et Wikidata ne livre un alias « Papin » que pour 28 % des
footballeurs notoires. 1 086 801 termes en tout.

Deux index sur `term`, pour deux usages, et un seul est sur le chemin chaud :

- **btree `text_pattern_ops`** — le préfixe, le cas dominant.
- **GIN trigrammes** — la tolérance aux fautes, en **secours**, lancée seulement
  quand le préfixe n'a rien trouvé du tout. Les trigrammes seuls sont mauvais sur
  les préfixes courts, et un secours qui se déclencherait aussi sur « j'ai trouvé
  peu » ferait payer un scan GIN à chaque nom correctement tapé.

Le classement est la notoriété (`sitelinks`), jamais l'alphabet. Le secours
classe sur la similarité **au dixième près**, puis la notoriété : les détails et
les mesures qui ont tranché sont dans `src/server/services/search.service.ts`.

Anti-rebond de 250 ms et minimum deux caractères côté client, tenus aussi côté
serveur : ce sont des leviers de charge, pas du confort — le typeahead est
l'endpoint le plus sollicité du site (`docs/stack-technique.md` §10).
