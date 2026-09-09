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
pnpm ingest:career Q1835 Q170328   # deux parcours, depuis Wikidata
pnpm dev            # http://localhost:3000, back-office sur /admin
```

`ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET` sont à remplir dans `.env.local` avant
d'ouvrir `/admin` : sans elles, le back-office refuse tout le monde, y compris
vous. `openssl rand -base64 32` fait l'affaire pour chacune.

Sans l'import du référentiel, la barre de recherche répond correctement — elle
ne trouve simplement personne. Sans import de parcours, le catalogue n'a aucun
footballeur curé : « curé » n'est pas un statut, c'est le fait d'avoir des
passages.

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
| `pnpm test:live` | **Le vrai Wikidata**, hors de `pnpm test`. Ce que les enregistrements ne peuvent pas vérifier : que les requêtes sont toujours du SPARQL valide et que l'endpoint répond |
| `pnpm db:generate` | Génère le SQL depuis le schéma Drizzle, à relire et committer |
| `pnpm db:import-referential` | Charge le référentiel de recherche depuis `.data/`. Idempotent : le relancer ne duplique rien |
| `pnpm ingest:career Q1835 …` | Importe le parcours d'un ou plusieurs footballeurs depuis Wikidata. Le déclencheur à la main, sans worker |
| `pnpm fixtures:wikidata` | Ré-enregistre les réponses Wikidata sur lesquelles la suite tourne. Le `git diff` est la revue |

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
    (game)/   la grille du jour
    (admin)/  le back-office. Bundle séparé : il ne pèse pas sur le jeu
  server/     le back. Chaque fichier : import 'server-only'.
    db/       schéma Drizzle + client. Personne d'autre n'y touche.
    domain/   règles pures. Zéro DB, zéro service, zéro import Next.
    ingest/   le pipeline Wikidata : il lit la source et rend des valeurs.
    auth/     la signature d'une session. Aucune table, aucune requête.
    services/ cas d'usage + transactions. LA SEULE PORTE D'ENTRÉE.
  ui/         composants présentationnels
    admin/    ceux du back-office. Les Server Actions leur arrivent en props
  shared/     isomorphe : types, schémas Zod, formatters
scripts/      outillage Node : migrations, référentiel, import d'un parcours
test/
  domain/       le seam pur — y compris la lecture d'une déclaration Wikidata
  shared/       le seam pur aussi : la couche isomorphe
  architecture/ les garde-fous : layering, server-only, garde d'admin
  services/     le seam principal, contre un vrai Postgres
  database/     schéma, index et outillage — rien qui appelle un service
  live/         le vrai Wikidata. Hors de `pnpm test`
  fixtures/     les jeux de données partagés, et les réponses enregistrées
  setup/        harnais de base de test
```

**La règle** : `app/` et `server/jobs/` ne peuvent importer que `services/` et
`shared/`. Jamais `db/`, jamais `domain/`.

Elle est écrite comme une **liste blanche** et non comme une liste noire :
`server/ingest` puis `server/auth` étaient gardés avant d'exister, et personne
n'a eu à revenir dans `eslint.config.mjs` le jour où ils sont apparus.

Une zone de plus depuis l'ingest : `server/ingest` ne peut voir ni `db/`, ni
`domain/`, ni `services/`. Le pipeline lit Wikidata et rend des valeurs ; les
écrire est le travail d'un service. C'est ce qui garde ses règles testables en
millisecondes.

Trois barrières, pas une :

1. `import 'server-only'` en tête de chaque fichier de `server/` — **le build
   casse** si un composant client le tire. Une seule exception :
   `db/schema.ts`, que drizzle-kit lit depuis du Node nu. Tout le reste de
   l'outillage qui doit tourner sous Node nu vit dans `scripts/`, hors de `src/`.
2. `import/no-restricted-paths` dans `eslint.config.mjs` — **la CI refuse** le
   raccourci.
3. `await requireAdmin()` en première ligne de chaque page et de chaque Server
   Action de `app/(admin)` — voir « Le back-office » ci-dessous.

Les trois barrières sont elles-mêmes testées (`test/architecture/`) : supprimer
la règle ESLint fait échouer la suite, oublier `server-only` sur un nouveau
fichier de `server/` aussi, et oublier la garde sur une nouvelle page d'admin
aussi.

## Tests

Ce qui fait un bon test ici : il appelle un service comme le ferait
l'application, contre un vrai Postgres, et n'affirme que du comportement
observable. Aucun test ne compte les requêtes SQL, aucun ne remplace Postgres
par un double — la moitié des décisions du projet vivent dans le schéma, les
contraintes d'unicité et les index.

Quatre projets Vitest :

- **`domain`** — fonctions pures, rien à démarrer, quelques millisecondes.
  Réservé aux matrices de cas larges : échelle de dévoilement, calendrier
  Europe/Paris, ordre du parcours, normalisation d'un terme de recherche.
  `test/shared/` y est rattaché : la couche isomorphe est pure aussi.
- **`architecture`** — pas des tests du produit, des tests des garde-fous qui le
  tiennent honnête. Ne lisent que la config ESLint et l'arborescence. Depuis le
  back-office, la garde d'admin en fait partie : un `export` nouveau dans
  `app/(admin)` qui oublie `await requireAdmin()` fait échouer la CI.
- **`postgres`** — tout ce qui a besoin d'un vrai Postgres : le seam principal
  (`test/services/`) et les contrôles de schéma (`test/database/`). Une base
  partagée par la suite, vidée entre chaque test, fichiers exécutés
  séquentiellement. Le jour où c'est lent, on donne une base à chaque worker :
  le changement tient dans `test/setup/`.
- **`live`** — le seul qui quitte la machine, et le seul absent de `pnpm test` :
  une suite qui échoue parce qu'un service tiers est lent est une suite qu'on
  cesse de croire. `pnpm test:live`. Il n'affirme que des **invariants** — le FC
  Barcelone est un club, l'Argentine n'en est pas un, un prêt est reconnu par la
  valeur de son qualificateur — jamais des chiffres, qui bougent dès que
  quelqu'un édite Wikidata.

Le seul double de tout le dépôt est l'exécuteur SPARQL de l'import : l'endpoint
est rejoué depuis les enregistrements de `test/fixtures/wikidata/`, capturés par
`pnpm fixtures:wikidata` avec les requêtes du code lui-même. Des réponses
inventées à la main ne prouveraient que notre accord avec nos propres croyances ;
celles-là contiennent ce que la source contient — un nombre de matchs sérialisé
`"28.0"`, un Messi sans libellé français, l'équipe de France typée « club de
football ».

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

## Le back-office : la curation d'un parcours

`/admin` cherche un footballeur dans le référentiel, ouvre son dossier, et le
corrige. C'est le poste de travail dominant du projet : ~1 100 parcours par an.

Ce que l'écran fait, et pourquoi :

- **Le lien Wikipédia est en haut de la page.** Un parcours peut être **complet
  et faux par omission** — au moins 21,5 % des carrières dont tous les passages
  sont renseignés ont un trou de deux ans ou plus — et **aucune requête ne le
  détecte**. Le seul garde-fou est l'admin qui lit l'article. Les années de
  Cantona à l'OM sont le cas d'école : sept passages complets, et l'OM n'existe
  pas dans la source.
- **Ajouter, corriger, supprimer un passage**, saisir les matchs et les buts
  manquants, annoter un prêt, affecter la nationalité.
- **Pas de glisser-déposer.** `player_clubs` n'a pas de colonne d'ordre : le
  parcours se trie par `(start_year, end_year, id)`, donc corriger un ordre,
  c'est corriger une année. Un glisser mentirait — la ligne reviendrait à sa
  place au rechargement.
- **Pas de statut de curation.** Ni `verified_at`, ni case « vérifié » : « curé »
  reste le fait d'avoir des passages. Les signalements sur chaque ligne sont
  recalculés à la lecture, donc corriger fait disparaître le signalement sans
  seconde écriture à oublier.

Deux aides à la curation, toutes deux **mesurées** et toutes deux muettes :

- **Les équipes réserve sont pré-signalées par leur libellé**, et **jamais
  supprimées seules**. La source les type comme des clubs seniors ordinaires —
  « FC Barcelone C » n'est rien d'autre — et les trois signaux structurels
  disponibles ne couvrent que 1,4 à 1,6 % des passages. Les deux noms du club
  sont lus, le français **et** l'anglais : la mesure a été faite sur les
  libellés anglais, et un nom français peut avoir perdu le marqueur. Le libellé
  est le meilleur des trois signaux et il se trompe : c'est un badge
  « réserve ? », et l'admin décide.
- **Les chevauchements sont signalés visuellement.** Une passation — un club qui
  finit l'année où le suivant commence — n'en est pas un, sinon toutes les
  carrières seraient signalées ; mais un passage **imbriqué** dans un autre en
  est un, même s'il ne partage qu'une année. Ce qui reste est le seul cas où
  l'ordre est réellement ambigu : un prêt dans son contrat parent, un doublon de
  la source, un transfert en cours de saison —
  [ADR-0007](./docs/adr/0007-un-chevauchement-n-est-pas-une-passation.md).
  Zidane ne déclenche rien, Cantona six passages sur sept.

Le bouton **« relancer l'import »** appelle le service en direct — un footballeur,
c'est deux requêtes SPARQL en attente d'I/O — puis `refresh()` : le parcours se
réaffiche sans rechargement. Il **remplace** tout (ADR-0005), donc une réserve
retirée à la main revient, et l'écran le dit à côté du bouton.

Ce que l'écran **ne** contrôle **pas** : les trois invraisemblances du modèle.
`goals <= matches` et `start_year >= 1880` sont des prédicats de
**programmation** (#6), pas des règles sur ce qu'on a le droit de stocker — les
imposer ici rendrait un passage de 1875 livré par la source impossible à éditer.
Les bornes des champs sont des garde-fous de frappe, plus larges que le modèle,
et le seul refus est qu'un passage finisse avant de commencer.

### La porte

Un secret partagé (`ADMIN_PASSWORD`) et un cookie signé (`ADMIN_SESSION_SECRET`),
en attendant le compte sans mot de passe de #13 — [ADR-0006](./docs/adr/0006-porte-du-back-office-avant-better-auth.md).
Sans les deux variables, `/admin` refuse tout le monde : un back-office qui
s'ouvre parce qu'une variable manque échoue du mauvais côté.

Le contrôle n'est **pas** dans un middleware, contrairement à ce qu'annonçait
`docs/stack-technique.md` §4bis. Depuis Next 16 : une Server Action est joignable
par un POST direct, et un layout ne décide pas si ses segments enfants
s'affichent. Ce qui reste, c'est `await requireAdmin()` en première ligne de
chaque page et de chaque action — et un test d'architecture qui fait échouer la
CI quand un export nouveau l'oublie.

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

## Le catalogue curé : l'import d'un parcours

`pnpm ingest:career Q1835` lit Wikidata et écrit le parcours senior d'**un**
footballeur : ses passages, les clubs qui manquaient, sa nationalité. C'est un
service (`src/server/services/ingest.service.ts`), pas de l'outillage — l'admin
le déclenchera depuis le back-office, et il n'y a **aucun job d'ingest** : un
footballeur, c'est deux requêtes SPARQL en attente d'I/O.

Quatre règles, toutes **mesurées** et non devinées (`docs/research/wikidata-coverage.md`) :

- **On lit les déclarations complètes**, `p:P54 / ps:P54`, jamais `wdt:P54` — qui
  ne rend que le rang préféré et masque donc toute la carrière d'un joueur en
  activité : Messi n'y a qu'un club.
- **Un club est `P31/P279* Q476028` moins les sélections nationales.** Le type
  exact est précis et perd le FC Barcelone ; la remontée des sous-classes seule
  avale 54 010 sélections, « équipe nationale masculine » étant sur Wikidata une
  sous-classe de « club de football ». Seule la soustraction est juste.
- **Un prêt est la *valeur* du qualificateur `pq:P1642`, `Q2914547`.** Sa
  présence ne dit rien : 1 804 déclarations le portent avec « transfert », dont
  le passage de Messi au PSG.
- **Un doublon est `(footballeur, club, année de début)`** — 6 721 groupes dans
  la source, et le seul nettoyage que la curation ne peut pas rattraper, puisque
  deux lignes pour un club ressemblent exactement à un vrai double passage. La
  déclaration la mieux documentée est conservée, les autres ne comblent que ses
  trous : deux nombres de matchs qui se contredisent ne s'additionnent pas.

Ce que l'import **ne fait pas** : il ne chasse pas les équipes réserve (elles
sont typées comme des clubs seniors — « FC Barcelone C » n'est rien d'autre — et
sont retirées à la main à la curation), et il ne répare pas une carrière. Les
années de Cantona à l'OM sont absentes de la source : ses trois prêts ne se
rattachent à rien et le trou 1988-1991 reste visible. Un parcours peut être
complet **et faux**, et le seul garde-fou est le coup d'œil de l'admin — ce que
l'affichage de `pnpm ingest:career` est fait pour permettre.

Il **remplace** le parcours et **refuse** trois choses : un item qui n'est pas un
footballeur, une carrière sans aucun passage en club, un footballeur inconnu du
référentiel que la source ne nomme pas. Le détail et les raisons sont dans
[ADR-0005](./docs/adr/0005-l-import-d-un-parcours-remplace-et-refuse.md).

Chaque exécution laisse une ligne dans `job_runs` — le footballeur, le volume,
les erreurs — écrite **hors** de la transaction qu'elle décrit : une course qui a
échoué et n'a rien laissé derrière elle est justement celle qu'on vient lire.
