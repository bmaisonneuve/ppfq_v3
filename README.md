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
pnpm dev            # http://localhost:3000
```

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
scripts/      outillage Node : migrations, extraction du référentiel
test/
  domain/       le seam pur
  architecture/ les garde-fous : layering, marqueur server-only
  services/     le seam principal, contre un vrai Postgres
  database/     contrôles de schéma qui n'appellent aucun service
  fixtures/     le jeu de données partagé
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
  Europe/Paris, ordre du parcours.
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
