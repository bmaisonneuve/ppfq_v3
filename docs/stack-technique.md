# Stack technique — Quiz de parcours footballistiques

Document technique, complément de `specs-jeu-quiz-football.md` (qui reste la référence fonctionnelle).
Décidé le 2026-09-08. Cible : 100 000 joueurs/jour, auto-hébergé.

---

## 1. Vue d'ensemble

| Couche | Choix | Note |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Front + back dans un repo, un déploiement |
| Base de données | **PostgreSQL** | Relationnel, `pg_trgm` + btree `text_pattern_ops` pour le typeahead |
| ORM | **Drizzle** | Typé, migrations SQL relues à la main |
| Auth | **Better Auth** (`magicLink` + `emailOTP`) | Sans mot de passe. Voir §4bis |
| Email transactionnel | **Scaleway TEM** (fr-par) | Seul des trois candidats à héberger données *et* logs en UE. Chemin de connexion critique : jamais le SMTP du VPS |
| UI | **Tailwind + shadcn/ui**, **Motion** | Motion pour l'animation de dévoilement des indices |
| Formulaires / tables | react-hook-form + Zod, TanStack Table | Surtout pour l'admin |
| Jobs & cron | **Graphile Worker** | File dans Postgres, crontab déclaré en code |
| Hébergement | **Coolify** sur VPS (Docker) | Pas de Vercel : maîtrise du monitoring |
| CDN / edge | **Cloudflare** devant | Cache du HTML et des assets, protection DDoS |
| Observabilité | Grafana + Prometheus + Loki + **Alloy** + OTel, GlitchTip, Uptime Kuma | Voir §8. Promtail est EOL depuis le 2 mars 2026 : Alloy dès le départ |
| Analytics produit | **Umami**, auto-hébergé, sans cookie | Imposé par la décision sur le cookie (§11) : aucun traceur à cookie. Réglage fin reporté |

**Ce qui n'est PAS dans la stack, et pourquoi :** pas de backend séparé (aucun second consommateur), pas de Redis (un seul réplica au départ), pas de temps réel, pas d'entrepôt analytique (Postgres suffit à ce volume), pas de CMS (l'admin a un seul utilisateur).

---

## 2. Ce que les specs imposent techniquement

Quatre contraintes qui pilotent tout le reste :

1. **La réponse ne doit jamais atteindre le client.** La saisie est une sélection dans une liste de 382 703 footballeurs : un essai est un `footballerId` et la comparaison est une égalité, mais elle reste **serveur** — envoyer l'id attendu au client, même haché, le rendrait vérifiable hors ligne contre le référentiel public.
2. **Les indices sont servis un par un.** Décennie + nationalité + matchs/buts par club, envoyés d'un bloc, identifient le joueur pour qui ouvre l'onglet réseau. La réponse à un essai ne contient que **le palier suivant**.
3. **Serveur autoritaire même sans compte.** L'état de partie vit côté serveur, clé = `players.id`, résolu depuis un UUID en cookie. La « reprise de progression à l'inscription » devient un `UPDATE players SET auth_user_id`, pas un merge localStorage ↔ DB.
4. **Fuseau Europe/Paris.** Toute date de grille est un `date` (pas un `timestamp`), et la grille du jour est un `SELECT WHERE date = <date du jour à Paris>` — un calcul paresseux, pas un job. Aucun composant n'est sensible à l'heure exacte, donc le changement d'heure est un non-sujet.

---

## 3. Architecture du code

Next ne donne pas de frontière front/back de *déploiement*. Il donne une frontière de **dépendances**, et c'est celle qui produit la lisibilité. Elle n'est pas fournie par défaut : on l'impose.

```
src/
  app/                      # routage + rendu. Aucune logique métier.
    (game)/                 #   grille du jour, archive
    (admin)/                #   back-office, layout + middleware propres
    api/                    #   webhooks, callbacks, typeahead
  server/                   # LE BACK. Chaque fichier : import 'server-only'
    db/                     #   schéma Drizzle + migrations. Personne d'autre n'y touche.
    domain/                 #   règles pures. Zéro DB, zéro import Next.
      reveal-ladder.ts      #     les 6 paliers et ce qui sort vers le client
      challenge-calendar.ts #     date Paris, grille du jour
    services/               #   cas d'usage + transactions. LA SEULE PORTE D'ENTRÉE.
    jobs/                   #   crontab + adaptateurs de tasks
    ingest/                 #   pipeline Wikidata
  ui/                       # composants présentationnels
  shared/                   # isomorphe : types, schémas Zod, formatters
```

### La règle unique

`app/` et `jobs/` ne peuvent importer que `services/` et `shared/`. **Jamais** `db/`, **jamais** `domain/`.

### Comment on l'impose (sinon ça dérive en trois semaines)

1. **`import 'server-only'`** en tête de tout fichier de `server/` → si un composant client l'importe, **le build casse**. Vraie barrière, pas une convention.
2. **ESLint `import/no-restricted-paths`** (ou `eslint-plugin-boundaries`) interdit `app/** → server/db/**` et `app/** → server/domain/**`. La CI refuse le raccourci.
3. **`domain/` testé sans rien démarrer.** Échelle de dévoilement, calcul de la grille du jour, dérivation du résumé partagé : fonctions pures, tests en millisecondes, aucun mock.

Bénéfice secondaire : si un jour il faut extraire le back (appli native, API publique), `server/` part tel quel.

---

## 4. Les portes d'entrée serveur

| Porte | Pour quoi | Dans ce jeu |
|---|---|---|
| **Server Component** | Toute lecture | Grille du jour, archive, tables admin, stats |
| **Server Action** | Écriture depuis l'UI | **L'essai**, sauvegarde d'un parcours, reprise de progression |
| **Route Handler** | Ce qui a besoin d'un contrat HTTP | Webhook, callbacks auth, typeahead |

La liste réaliste des routes API tient en quatre lignes :

```
app/api/auth/[...all]/route.ts    # monté par Better Auth
app/api/footballers/search/route.ts # typeahead : sur le chemin critique, voir §10
app/api/admin/jobs/[name]/route.ts# enfile un job (202), n'exécute JAMAIS en ligne
app/api/health/challenge-today/route.ts
```

> **Complété par l'ADR-0009** : il y en a cinq. `app/api/game/state/route.ts`
> porte l'état personnel d'une grille, parce que la page de la grille ne lit
> aucun cookie (ADR-0008) et que cette réponse-là a besoin d'un contrat HTTP —
> `private, no-store` devant un CDN, et un cookie à poser. C'est un POST, parce
> qu'ouvrir une énigme **crée** une partie : un GET serait déclenché par un
> préchargement de lien ou un crawler, et chacun compterait comme une personne
> exposée à l'énigme.

> **Complété par l'[ADR-0010](./adr/0010-le-blason-en-base-adresse-par-son-contenu.md)** :
> il y en a six. `app/api/crests/[key]/route.ts` sert les octets d'un blason à
> une adresse qui **est** leur SHA-256. Un contrat HTTP, pour la raison
> inverse de la précédente : `public, immutable`, un an de `max-age`, et rien à
> invalider puisque remplacer un blason change son adresse. Publique et sans
> `requireAdmin()` — un CDN ne cache pas ce qu'il doit authentifier, et il n'y
> a rien à énumérer.

### L'essai

Une Server Action **est** un endpoint : à la compilation, Next génère un POST vers l'URL courante avec un header `Next-Action`. Il y a bien un aller-retour réseau ; simplement on n'écrit pas la route, et le corps de la fonction ne part jamais dans le bundle client.

```ts
// src/server/domain/reveal-ladder.ts    — pur
export function revealedAt(tries: number, career: PlayerCareer): RevealedHint

// src/server/services/play.service.ts   — 'server-only'
export async function submitGuess(args: {
  playerId: string; challengeItemId: string; footballerId: string
}): Promise<TryResult>
export async function skipTry(args: {
  playerId: string; challengeItemId: string
}): Promise<TryResult>

// src/app/(game)/actions.ts             — adaptateur, 5 lignes
'use server'
export async function guessAction(_prev: TryResult | null, form: FormData) {
  const input = GuessInput.parse(Object.fromEntries(form))
  return playService.submitGuess({ ...input, playerId: await getPlayerId() })
}
```

Le type de retour encode les règles des specs et force l'UI à traiter chaque cas :

```ts
type TryResult =
  | { status: 'correct';   triesUsed: number; reveal: ChallengeItemReveal }
  | { status: 'wrong';     triesUsed: number; hint: RevealedHint }  // UN indice, le suivant
  | { status: 'exhausted'; reveal: ChallengeItemReveal }                   // 6e erreur

// Trois cas seulement : la saisie est une sélection dans une liste, donc
// « pas un footballeur » n'existe pas, et le doublon consomme un essai.
// Le bouton « passer » emprunte le même chemin et renvoie 'wrong'.
```

**Vigilance :** une Server Action est un endpoint POST public. Elle n'est pas protégée parce qu'elle est « du code serveur ». Chaque action fait son propre parse Zod + contrôle de rôle avant d'appeler le service.

**Anti-triche — s'arrêter au bon niveau :** la réponse ne sort jamais, le service refuse le 7e essai pour un `(player_id, challenge_item_id)`, et un rate limit protège l'endpoint. C'est suffisant. Le jeu est sans classement : quelqu'un qui rotate son cookie d'identité anonyme pour forcer une réponse ne pénalise que lui. Ne pas sur-investir.

**Double soumission :** un double-clic enverrait deux POST et brûlerait deux essais — un vrai risque depuis que le doublon consomme un essai. `isPending` désactive le formulaire côté client, et côté serveur `player_progress.last_guess_footballer_id` / `last_guess_at` ignorent une proposition identique dans les deux secondes. C'est une protection technique, pas une règle de jeu.

**Latence :** pas d'optimistic UI possible (le client ignore la réponse). ~200 ms de `isPending` sur le bouton puis l'animation de révélation se lit comme une intention de design, pas comme une lenteur.

---

## 4bis. Authentification

**Magic link + code à 6 chiffres par email, sans mot de passe.** Better Auth, plugins `magicLink` et `emailOTP` (tous deux de première partie).

Pourquoi ça colle aux specs : inscription et connexion deviennent **une seule action**, conforme au §6 des specs (« proposée au moment où elle a une valeur évidente »). Pas de mot de passe stocké, pas de flow de réinitialisation, pas de credential stuffing sur un compte qui ne contient que des statistiques.

```ts
// src/server/auth.ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  session: { expiresIn: 60 * 60 * 24 * 180, updateAge: 60 * 60 * 24 },
  plugins: [
    magicLink({ expiresIn: 60 * 10, sendMagicLink: async ({ email, url }) => {…} }),
    emailOTP({ otpLength: 6, expiresIn: 60 * 10, sendVerificationOTP: async ({ email, otp }) => {…} }),
  ],
})
```

### Le code à 6 chiffres est la voie principale, pas un secours

Contre-intuitif, mais il résout deux problèmes que le lien seul crée :

**1. Le lien casse la reprise de progression anonyme.** Le lien est cliqué dans le client mail, qui ouvre souvent un autre navigateur (webview Gmail, navigateur par défaut ≠ celui du jeu). Le cookie d'identité anonyme vit dans le navigateur d'origine → la progression anonyme est perdue exactement au moment où le §6 des specs promet de la reprendre. Un code tapé dans l'onglet où l'on jouait garde le cookie intact.

**2. Les scanners de liens brûlent le token.** Outlook SafeLinks, antivirus mail et certains clients préchargent les URL : le token à usage unique est consommé avant le clic, et sans mot de passe l'utilisateur est bloqué. Un code n'est pas préchargeable.

Le lien reste le raccourci pour ceux qui sont sur le même appareil. Son callback doit être **GET → page « Confirmer la connexion » → POST** : un préchargement ne consomme alors rien.

### La reprise de progression, côté serveur

Ne jamais faire la reprise depuis le seul cookie au callback. L'association se fait **en base, à la demande du code/lien**, quand le cookie est encore présent :

```ts
// à la demande, depuis la partie en cours
await db.insert(pendingClaims).values({ email, anonId, expiresAt })

// hook Better Auth à la création de session — vaut pour le lien ET pour le code
databaseHooks: {
  session: { create: { after: async (session, ctx) => {
    const anonId = readAnonCookie(ctx) ?? await findPendingClaim(session.userId)
    if (anonId) await playService.claimAnonProgress(session.userId, anonId)
  }}}
}
```

Idempotent, et insensible au navigateur qui ouvre le lien.

### L'email devient une dépendance critique

Sans mot de passe, un email qui n'arrive pas = **impossible de se connecter**.

- **Jamais le SMTP du VPS** : une IP fraîche part en spam, et Hetzner bloque le port 25 par défaut sur les nouveaux comptes.
- Provider transactionnel : **Scaleway TEM**. Resend et Postmark stockent données et logs **aux États-Unis** et le disent eux-mêmes — le `eu-west-1` de Resend ne contrôle pas où résident les données, et Postmark annonce n'avoir « no plans to add servers in the EU ». Une adresse email est une donnée personnelle : les envoyer hors UE rouvrirait le dossier que la décision sur le cookie (§11) venait de fermer. Scaleway est aussi le moins cher (~25 €/mois à 100 k contre ~126 $ Postmark) et le seul chez qui une **IP dédiée** soit atteignable à ce volume, tout en interdisant le marketing par contrat — ce qui protège la réputation des magic links.
- **Deux verrous Scaleway à lever d'avance** : le quota par défaut est de **10 000 emails/mois**, débloqué par ticket support avec vérification d'identité (plusieurs jours — à lancer tôt, pas la veille du lancement) ; et les **webhooks sont en bêta**, sans POST HTTP direct (passage imposé par Topics & Events, facturé à part, un webhook par domaine en Essential). En attendant, `email_events` est alimentée par un job nocturne qui interroge le statut des envois via l'API.
- **SPF + DKIM + DMARC** sur le domaine, non négociable. Sous-domaine d'envoi dédié au transactionnel, séparé de tout envoi marketing.
- **Webhooks bounce/complaint** → table `email_events` + GlitchTip. Une panne de délivrabilité silencieuse est une panne de connexion silencieuse. À surveiller comme un service.

### Réglages à ne pas laisser par défaut

| Réglage | Valeur | Raison |
|---|---|---|
| Rate limit demande de lien | **par IP _et_ par adresse email** | Sans le second, on peut bombarder la boîte d'un tiers. En mémoire tant qu'il y a un réplica |
| TTL du token / code | 10 min, usage unique | |
| `session.expiresIn` | **180 jours**, `updateAge` glissant | Jeu d'habitude quotidien : re-demander un email tous les 15 jours serait contre-productif |

### Admin

Avec du magic link seul, **qui contrôle la boîte mail contrôle le back-office**. C'est assumé : ni passkey, ni second facteur sur le compte admin. La conséquence à connaître est que la sécurité du back-office **est** celle de la boîte mail de l'admin — c'est donc là, et nulle part dans ce code, qu'il faut la renforcer. Le dispositif se limite au TTL de 10 minutes et à l'usage unique du token.

> **Corrigé par [ADR-0006](./adr/0006-porte-du-back-office-avant-better-auth.md).** « Check de rôle en middleware » ne tient pas sous Next 16 : une Server Action est joignable par un POST direct, et un layout ne décide pas si ses segments enfants s'affichent. Le contrôle est `await requireAdmin()` en première ligne de chaque page et de chaque action d'admin, tenu par un test d'architecture. En attendant #13, la porte est un secret partagé et un cookie signé.

---

## 5. Modèle de données

> **Remplacé par [`docs/modele-donnees.md`](./docs/modele-donnees.md)**, qui porte le schéma Drizzle complet et les arbitrages.
>
> Ce document-là est la **source de vérité** du modèle de données : en cas de divergence avec ce qui est écrit ici, c'est lui qui gagne et c'est ce fichier-ci qu'il faut corriger.

Les deux principes structurants, rappelés ici parce que tout le reste en découle :

**Une énigme désigne un footballeur, elle ne le copie pas.** `challenge_items` porte une grille, une position et un `footballer_id` ; le parcours, les durées, les matchs, les buts et la nationalité sont lus dans les tables au rendu. Le modèle et l'admin y gagnent en simplicité, au prix d'une exposition : un import qui modifie un parcours modifie toutes les grilles où ce footballeur apparaît, y compris en archive et pendant une partie. Voir `docs/modele-donnees.md` §11.

**L'ingest écrit directement sur le footballeur.** Pas de file de validation : l'import met à jour le catalogue tel quel. Combiné à l'absence de parcours figé, cela veut dire qu'un import peut atteindre une grille publiée sans aucun filtre — mais **l'import est un acte volontaire de l'admin**, footballeur par footballeur, et non un job nocturne : rien ne réécrit un parcours en silence. C'est ce qui rend l'exposition décrite en ADR-0001 supportable sans garde-fou. Aucune découverte automatique des changements Wikidata n'est prévue.

**Source :** Wikidata (P54), seule source massivement exploitable sans problème de conditions d'utilisation. Un extract de 382 703 footballeurs et 225 886 alias est déjà en place dans `.data/` — c'est le **référentiel de recherche**, il ne contient aucun parcours.

**Ce que la source donne réellement**, mesuré le 2026-09-09 (voir `docs/research/wikidata-coverage.md`) :

| Fait | Conséquence pour l'ingest |
|---|---|
| `wdt:P54` masque toute la carrière d'un joueur en activité | Passer par `p:P54 / ps:P54` et lire les qualificateurs sur la déclaration |
| Un club = `P279* Q476028` **moins** `P279* Q6979593` → 948 951 passages | `P31` exact rate le FC Barcelone ; `P31/P279* Q476028` avale 54 010 sélections |
| Prêt = `pq:P1642` **de valeur `Q2914547`** | Tester la valeur, pas la présence : 1 804 déclarations portent P1642 avec « transfer » (le PSG de Messi, par exemple) |
| Début + matchs + buts sur 60,7 % des passages, 91,0 % à sl ≥ 40 | La notoriété est le meilleur prédicteur de complétude |
| `P1350`/`P1351` = **championnat seulement** | Dit au joueur dans l'énoncé des paliers 4 et 5 (specs §3) |
| Réserves non détectables (1,4-1,6 % des passages seulement) | Retirées à la main à la curation, avec pré-signalement par libellé |
| ≥ 21,5 % des carrières « complètes » ont un trou de ≥ 2 ans | **Un parcours peut être complet et faux** : l'OM de Cantona n'existe pas dans Wikidata |

⚠️ **Le vrai chantier du projet, c'est la donnée**, pas le framework : 3 énigmes/jour = ~1 100 parcours/an à curer et calibrer.

---

## 6. L'espace d'administration

Route group `app/(admin)` avec layout ; le contrôle d'accès est `await requireAdmin()` dans chaque page et chaque action, pas un middleware ([ADR-0006](./adr/0006-porte-du-back-office-avant-better-auth.md)). Next code-splitte par route : **le bundle admin ne pèse pas sur le jeu**, pas besoin d'une seconde app.

| Écran | Point délicat |
|---|---|
| Éditeur de parcours | Liste ordonnée, toggle *prêt* par ligne, double passage par un même club. L'ordre n'est **pas** stocké : il est déterminé par `(start_year, end_year, id)`, et le seul moyen de le corriger est d'ajuster les années. Pas de drag & drop, qui promettrait un ordre libre que le modèle ne porte pas. Deux aides à la curation : pré-signalement des **équipes réserve** par heuristique de libellé (` II`, ` B`, ` C`, `Jong`, `U21`, `Reserve`) — signalées, jamais supprimées seules, l'heuristique se trompant — et alerte visuelle sur les **chevauchements** de passages, seul cas où l'ordre est réellement ambigu |
| Calendrier de programmation | 3 slots par date, vue mois, **trous signalés** |
| Aperçu joueur | Rejouer la grille comme un utilisateur, avec les 6 paliers |
| Diagnostic | `job_runs` + `graphile_worker.jobs` (échecs, `attempts`, `last_error`) |
| Stats de calibrage | **Taux de réussite par slot** — le seul retour qui dit si « l'échauffement » était en fait une « légende » |

**Payload CMS a été écarté** : un seul utilisateur qui saisit trois fiches par jour, l'admin n'a pas besoin d'être beau, et les deux écrans qui coûtent (calendrier, aperçu) sont custom de toute façon. En échange il imposerait son modèle de données. Fait main, ~1 à 2 semaines.

---

## 7. Jobs & cron

Les horaires appartiennent au code, versionnés et relus en PR — pas à une case dans l'UI Coolify.

```ts
// src/server/jobs/index.ts   ← source de vérité des horaires
export const crontab = `
0  9 * * 1   schedule_check_gaps
0  23 * * *  cache_revalidate
0  5 * * *   email_events_poll
`

export const taskList = {
  schedule_check_gaps: task(scheduleService.checkGaps),
  cache_revalidate:    task(cacheService.revalidateToday),
  email_events_poll:   task(emailService.pollDeliveryStatus),
}
```

```ts
// worker.ts   ← second entrypoint, MÊME image Docker
import { run } from 'graphile-worker'
await run({ connectionString, crontab, taskList, concurrency: 4 })
```

**Une task est un adaptateur**, exactement comme une Server Action : parse Zod, appelle le service, rien d'autre. Le helper `task()` porte les préoccupations transverses en un seul endroit — span OpenTelemetry, écriture dans `job_runs`, capture d'erreur. Le même chemin de code sert l'UI et le cron.

| Job | Fréquence | Rôle |
|---|---|---|
| `schedule_check_gaps` | hebdo | **Alerte si moins de N jours programmés d'avance** |
| `cache_revalidate` | quotidien | Pré-chauffe le cache de la grille avant l'arrivée du monde |
| `email_events_poll` | quotidien | Interroge le statut des envois et alimente `email_events` — les webhooks Scaleway sont en bêta (§4bis) |

**Il n'y a aucun job d'ingest.** L'import n'est pas automatique : l'admin déclenche le rafraîchissement d'**un** footballeur depuis le back-office, et le service est appelé en direct — un footballeur représente quelques requêtes SPARQL en attente d'I/O, ce qui ne justifie ni file ni fan-out. Il n'y a pas non plus de réconciliation nocturne des agrégats : `player_stats` est écrit dans la transaction qui termine la partie.

`schedule_check_gaps` est le job qui empêche le matin sans grille. Il ne contrôle aucun thème : un thème peut être posé n'importe quel jour, et la cohérence entre le thème annoncé et les footballeurs choisis relève de l'admin.

`?fill=1d` : si le worker était arrêté à l'heure prévue, Graphile Worker **rattrape** l'exécution manquée au redémarrage. Mettre `TZ=Europe/Paris` sur le conteneur worker pour un crontab lisible.

### Worker séparé, même image

`CMD ["node", "worker.js"]` sur une seconde ressource Coolify. Raisons — aucune n'est la duplication (le crontab de Graphile Worker se coordonne via Postgres et supporte plusieurs workers) :

1. **Boucle d'événements** : Node est mono-thread ; un batch d'ingest ajoute de la latence aux essais en cours.
2. **Monitoring** : deux flux de logs, deux jeux de métriques, deux limites mémoire. Un pic mémoire sur l'ingest ne fait pas tomber le jeu.
3. **Redémarrer l'un sans l'autre.**

Le coût est nul (même image, `CMD` différent) — c'est l'argument, pas un danger.

**Arrêt propre obligatoire** : sur `SIGTERM`, Graphile Worker termine le job en cours et relâche ses verrous. Sans ça, un job tué reste verrouillé plusieurs heures avant d'être réessayé.

### Déclenchement manuel

La file étant dans Postgres, l'app Next enfile sans HTTP vers le worker :

```ts
await utils.addJob('cache_revalidate', {}, { jobKey: 'revalidate:today' })
```

Utile pour rejouer un job périodique à la demande, le `jobKey` évitant le doublon au double-clic. Une route d'admin qui enfile **répond 202** et n'exécute jamais un batch dans un handler HTTP. Le bouton « relancer l'import » d'un footballeur, lui, appelle le service en direct : ce n'est pas un batch.

---

## 8. Déploiement (Coolify)

```js
// next.config.js
module.exports = { output: 'standalone' }
```

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm i --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_URL          # voir piège 1
RUN corepack enable && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### Les pièges

1. **`NEXT_PUBLIC_*` est figé au build**, pas au runtime. Les cocher comme *build variable* dans Coolify, sinon on cherche longtemps pourquoi une variable « est vide en prod ».
2. **`HOSTNAME=0.0.0.0`** — sinon le serveur standalone n'écoute que sur localhost et Traefik ne le voit pas.
3. **`.next/cache` est éphémère** dans un conteneur. Rester à **un seul réplica** et monter un volume. À deux réplicas seulement, un `cacheHandler` Redis devient nécessaire.
4. **Le build tourne sur le VPS de prod.** Un `next build` consomme 2-4 Go et sature plusieurs cœurs. Parades : 4-8 Go de swap avec `vm.swappiness=10`, une **limite mémoire explicite par conteneur** (surtout Postgres, pour qu'il ne soit jamais le candidat de l'OOM killer), et à terme un **serveur de build distant** Coolify (~5 €/mois).
5. **Activer le healthcheck** dans Coolify. Sans lui, chaque déploiement coupe le site le temps du redémarrage.

### Un seul réplica au départ

Ce que ça retire : Redis, `cacheHandler` custom, Upstash Ratelimit (une **Map LRU en mémoire** suffit), sticky sessions, verrou distribué. Garder ces choix derrière une petite interface (`rateLimiter.check()`) pour pouvoir changer l'implémentation, pas les appelants.

Le jour du passage à deux réplicas : le rate limit devient par réplica (**dégrade proprement**, limite × 2), `.next/cache` devient incohérent (**visible mais bénin** → cache handler Redis), les crons ne bougent pas (dans le worker, coordonnés en base).

### Dimensionnement du VPS

Budget RAM pour la cible 100 k/jour, tout colocalisé :

| Composant | RAM |
|---|---|
| Coolify (Traefik, sa base, realtime) | 1,5 Go |
| App Next (1 réplica) | 1 Go |
| Worker Graphile | 1 Go |
| **Postgres** | **6-8 Go** |
| Grafana + Prometheus + Loki + Alloy + collecteur OTel | 3 Go (hypothèse : seul Grafana publie un minimum, 512 Mo ; Prometheus, Loki monolithique et le collecteur OTel n'en documentent aucun — à surveiller, pas un chiffre sourcé) |
| GlitchTip | 1,5 Go |
| Uptime Kuma + Umami | 0,5 Go |
| Cache disque OS (Postgres en dépend) | 4 Go |
| **Marge de build/déploiement** | **4 Go** |
| **Total** | **~24 Go** |

| Palier | Machine |
|---|---|
| Démarrage, obs minimale (Coolify + Kuma + GlitchTip) | 4 vCPU / 8 Go / 80 Go |
| **Démarrage réaliste** (stack d'obs complète) | **4-6 vCPU / 16 Go / 160 Go NVMe** |
| **Cible 100 k/jour** | **8 vCPU / 32 Go / 240-500 Go NVMe** |

**Partir directement sur 16 Go** : avec la stack complète, 8 Go tient à l'arrêt mais pas pendant un déploiement — et l'OOM-kill tombe presque toujours sur Postgres. Préférer du **vCPU dédié** (Hetzner CCX plutôt que CPX) : Postgres et les builds souffrent du CPU mutualisé.

Ordres de grandeur : Hetzner CAX41 (16 vCPU ARM / 32 Go / 320 Go) ~30 €/mois, CPX51 (16 vCPU AMD partagé / 32 Go) ~55 €, CCX33 (8 vCPU dédiés / 32 Go / 240 Go) ~60 €. L'ARM64 est le meilleur rapport qualité/prix, **à condition de vérifier** que chaque outil publie de l'arm64 (GlitchTip notamment) — sinon l'émulation annule le gain.

**Disque :** `player_progress` ≈ 110 M lignes/an à la cible × ~120 o avec index ≈ **15-20 Go/an** (la table `game_events` par essai a été abandonnée : voir `docs/modele-donnees.md` §7), plus WAL, images Docker accumulées par Coolify, TSDB Prometheus, logs Loki. 240 Go sont largement suffisants. Activer le nettoyage Docker planifié et fixer explicitement la rétention Prometheus/Loki (30 jours). Attention : chez la plupart des hébergeurs on augmente CPU et RAM mais **pas** le disque à la baisse — surdimensionner la RAM, pas le disque.

---

## 9. Observabilité

| Besoin | Outil | Note |
|---|---|---|
| Uptime + alerte | **Uptime Kuma** | Léger, one-click Coolify |
| Erreurs | **GlitchTip** | Compatible SDK Sentry. Sentry self-hosted = ~20 conteneurs / ~16 Go, hors sujet |
| Traces + métriques + logs | **Grafana + Prometheus + Loki** | SigNoz écarté : son moteur ClickHouse recommande 32 Go et lève des *memory exceptions* sous 16 Go, or il partagerait la RAM d'un Postgres qui en veut 6 à 8 ; et depuis la v0.130.0 son docker-compose n'est plus distribué (génération par `foundryctl forge`, à régénérer à chaque version) |
| Logs structurés | **pino** en JSON | Vers Loki, expédiés par **Alloy** — Promtail est EOL depuis le 2 mars 2026 |
| Analytics produit | **Umami**, sans cookie | Un traceur à cookie ramènerait le bandeau de consentement, et un refus casserait la progression (§11). Écarte PostHog, qui dépose des cookies par défaut |

Instrumentation : Next a un hook natif **`instrumentation.ts`** à la racine → `@opentelemetry/sdk-node` en export OTLP. On trace `guessAction → play.service → Postgres` de bout en bout.

**Les deux moniteurs spécifiques au jeu**, les plus utiles :

- **`/api/health/challenge-today`** renvoie 500 s'il n'y a pas de grille programmée pour la date du jour à Paris, surveillé par Uptime Kuma. Couplé à `schedule_check_gaps`, c'est ce qui garantit qu'un matin sans grille n'échappe pas.
- **Push monitor Uptime Kuma** : `cache_revalidate`, quotidien, ping une URL à chaque succès. Pas de ping en 26 h → alerte. C'est ce qui détecte un worker mort — un worker arrêté ne fait aucun bruit.

---

## 10. Performance et scaling

Calcul pour 100 000 joueurs/jour :

| | Volume |
|---|---|
| Requêtes par joueur | ~13 de jeu (1 page, ~10 POST d'essai, 2 lectures) **+ ~35 de typeahead** |
| Total | ~4,8 M req/jour ≈ **55 req/s en moyenne** |
| Heure de pointe (25 % des joueurs) | ~330 req/s |
| Pic à la minute | **~900 req/s** |

Le passage à la recherche avec sélection **multiplie le volume par ~3,5** : chaque essai déclenche plusieurs requêtes de typeahead. Ce sont des lectures pures sur un index, mises en cache côté Cloudflare pour les préfixes courants — mais c'est désormais l'endpoint le plus sollicité du site, devant l'essai lui-même. Anti-rebond de 250 ms et minimum 2 caractères côté client ne sont pas du confort, ce sont des leviers de charge.

Coût unitaire : un essai = 2 requêtes Postgres et une comparaison d'identifiants ≈ **2-3 ms, majoritairement en attente d'I/O** ; une requête de typeahead = un parcours d'index préfixe ≈ **1-2 ms** — exactement le profil pour lequel Node est bon. Un rendu de page = 20-40 ms de CPU, mais seulement ~7 chargements/s en pointe ≈ **0,3 cœur**.

**Un conteneur Node sur 4 vCPU absorbe ça avec une large marge.** Changer de techno backend (Go, Rust) optimiserait 1 ms sur les 3 d'une requête déjà dominée par le réseau, et ne toucherait pas au seul poste coûteux — le rendu React, qui est du front.

### Ce qui casse réellement en premier

1. **`player_progress`** — ~110 M lignes/an à la cible, une ligne par énigme ouverte. Partitionnement mensuel **reporté** faute de volume au démarrage, à faire avant ~100 M de lignes où la migration devient pénible. `player_stats` rend la purge des vieilles partitions sans effet sur les statistiques à vie.
2. **Le pic de minuit** — pas 15 req/s moyennes, mais potentiellement 20 000 personnes en cinq minutes. Levier gratuit : **la grille du jour est identique pour tous** → cache pleine page (Cloudflare, ou le full route cache de Next), rendue une fois par jour. Contrepartie, **tranchée** : la page de la grille ne lit **aucun** cookie et reste donc entièrement statique — revalidée une fois par jour, cachée pleine page par Cloudflare, un HIT ne coûtant rien à l'origine. L'état personnel (mes essais, mes indices déjà dévoilés, mes stats) est chargé par une requête dédiée juste après l'hydratation. Le prix est un bref état de chargement sur les seules zones personnelles ; le parcours, qui *est* l'énigme, s'affiche immédiatement.

Propriété qu'on gagne au passage : la page cachée ne contient structurellement ni donnée personnelle ni indice, donc la fuite par le cache partagé devient impossible par construction plutôt que par vigilance. Si le Partial Prerendering s'avère stable au moment d'implémenter, on y passe sans rien restructurer — le découpage coquille/personnel est le même. **C'est le seul vrai travail d'architecture que 100 k joueurs imposent.**
3. **Postgres** — 250 écritures/s en pointe, aucune contention (chaque session écrit sa propre ligne). Pool à 20 connexions.

### Ordre dans lequel scaler

1. Cacher la grille du jour ← **maintenant, c'est gratuit et ça règle le pic**
2. Indexer le typeahead correctement ← **maintenant, c'est le nouveau chemin critique**
3. 2-3 réplicas Node (horizontal, trivial) + PgBouncer
4. Réplica de lecture Postgres pour les stats et l'archive
5. Profiler avant de réécrire quoi que ce soit

OpenTelemetry donnera le p95 par route : décider sur cette base, pas sur une intuition.

---

## 11. Décisions actées

| Décision | Raison |
|---|---|
| Next.js monolithe, pas de back séparé | Aucun second consommateur. La lisibilité vient du layering, pas d'un second déploiement |
| Séparation par dépendances (`app/` → `services/` → `domain/` → `db/`) | Imposée par `server-only` + ESLint, pas par convention |
| Validation des essais côté serveur, un indice à la fois | Contrainte anti-triche issue des specs |
| Server Action pour l'essai (pas de route explicite) | Un seul consommateur ; la sûreté de type sur `GuessResult` vaut plus qu'un contrat HTTP |
| Énigme lue à la volée dans le catalogue | Une énigme est une désignation, pas une copie ; le prix est une exposition aux mouvements du catalogue |
| Ingest écrivant directement, sans file de validation | Modèle et admin plus simples ; le catalogue est la seule source de vérité |
| Graphile Worker plutôt qu'Inngest | Inngest palliait les plafonds serverless de Vercel ; avec un process persistant, la file dans Postgres est strictement mieux |
| Crontab en code, dans le worker | Horaires versionnés et relus en PR ; isolation de la boucle d'événements et des métriques |
| Coolify plutôt que Vercel | Maîtrise du monitoring |
| Un seul réplica au départ | Retire Redis, le rate limit distribué et le cache handler custom |
| Magic link + code à 6 chiffres, sans mot de passe | Inscription et connexion en une action (specs §6) ; le code protège la reprise de progression et résiste aux scanners de liens |
| Provider email transactionnel externe | Sans mot de passe, l'email EST le chemin de connexion |
| Cloudflare devant | Compense l'absence de CDN, protège l'endpoint d'essai |
| Admin fait main, pas Payload | Un seul utilisateur, 3 fiches/jour ; les écrans coûteux sont custom de toute façon |
| Migrations Drizzle sous revue humaine, pas de `push` auto | Un `drizzle-kit push` mal cadré sur `player_clubs` se répare mal |
| Postgres au plus simple, pas d'entrepôt analytique | Le volume ne le justifie pas ; rollups nocturnes suffisent |
| **Postgres auto-hébergé sur Coolify**, pas de managé | Le typeahead est le chemin critique (~35 requêtes par joueur) : colocalisé, il répond en sous-milliseconde là où un Postgres distant ajoute un aller-retour réseau à chaque frappe. Contrepartie assumée : les sauvegardes sont à notre charge, avec volume dédié et **restore testé avant la première grille publiée** — dès cette grille il y a de la progression joueur à perdre |
| **Observabilité sur le même VPS**, pour l'instant | Une seule machine à administrer. Risque accepté et connu : Grafana et Loki tombent avec la machine qu'ils observent, et un pic de logs peut lui-même causer la saturation. Le second VPS (~6 €/mois) reste la parade disponible |
| **Blasons de clubs affichés** | Risque juridique évalué et accepté. Les octets vivent dans Postgres, adressés par leur SHA-256, avec leur source et leur licence à côté pour qu'un retrait soit une ligne à supprimer ([ADR-0010](./adr/0010-le-blason-en-base-adresse-par-son-contenu.md)) |
| **Cookie d'identité anonyme strictement nécessaire** | Il ne sert qu'à fournir le service demandé : base légale = exécution du service, **pas de bandeau de consentement**, 13 mois glissants, mention en politique de confidentialité. Contrainte qui en découle : aucun traceur analytique à cookie, sinon le bandeau revient et un refus casserait la progression |
| **Résumé partagé en texte seul, pas d'image OG en v1** | L'OG dynamique ferait entrer un identifiant de résumé stocké dans un modèle conçu pour n'en avoir aucun. À décider après avoir vu si les gens partagent |
| **Aucun avertissement quand le catalogue bouge sous une grille** | Une grille du jour modifiée par un import n'est pas grave ; on ne paie pas un mécanisme pour ça. D'autant que l'import est déclenché à la main, footballeur par footballeur |
| **Aucun import automatique, aucun rollup nocturne** | L'admin déclenche l'import d'un footballeur ; `player_stats` est écrit dans la transaction qui termine la partie. Trois jobs périodiques subsistent : trous de programmation, pré-chauffage du cache, statut des envois email |
| **`player_progress` non partitionnée à la création** | À 300 000 lignes/jour, les 100 M sont à ~11 mois *de la cible*, pas du lancement. Partitionner tout de suite compliquerait requêtes et migrations pendant un ou deux ans pour un seuil peut-être jamais atteint |
| **Ordre du parcours par les années, pas de drag & drop dans l'admin** | Sans colonne d'ordre, un glisser-déposer mentirait : la ligne reviendrait à sa place au rechargement. L'éditeur trie et signale les chevauchements ; corriger un ordre, c'est ajuster une année |
| **Coquille de grille statique, état personnel en second temps** | Lire un cookie rendrait toute la route dynamique et exposerait l'origine au pic de minuit (20 000 personnes en cinq minutes). La page ne lit aucun cookie : Cloudflare absorbe le pic, et aucun indice ne peut fuir par le cache partagé |
| **Admin protégé par le seul magic link** | Ni passkey ni second facteur. La sécurité du back-office est celle de la boîte mail de l'admin, et c'est assumé. En attendant #13, un secret partagé et un cookie signé ([ADR-0006](./adr/0006-porte-du-back-office-avant-better-auth.md)) |
| **Grafana + Prometheus + Loki + Alloy, pas SigNoz** | ClickHouse, moteur obligatoire de SigNoz, recommande 32 Go et lève des *memory exceptions* sous 16 Go : colocalisé (§11), il met le jeu à la merci de l'outil censé le surveiller. S'y ajoute la régénération du compose par `foundryctl forge` à chaque version, exactement le frottement qui fait qu'on arrête de mettre à jour |
| **Scaleway TEM pour l'email transactionnel** | Seul des trois à héberger données et logs en UE, le moins cher, et le seul à rendre une IP dédiée atteignable à ce volume. Deux verrous connus : quota initial de 10 k/mois à faire lever, webhooks en bêta |
| **Umami sans cookie pour l'analytics** | Cohérence avec la décision sur le cookie. Ce qu'on perd — funnels, replay de session — ne sert pas un jeu à un seul écran, dont le retour utile (taux de réussite par position) vient de notre propre base |

---

## 12. Points à éclaircir

Onze points ont été tranchés le 2026-09-09 et sont remontés en §11 : durée et ordre lus au rendu, blasons de clubs, Postgres auto-hébergé, observabilité colocalisée, cookie anonyme et RGPD, format du résumé partagé, absence d'avertissement sur mouvement du catalogue.

### Encore ouvert

1. **Le pipeline d'extraction des parcours.** Le cadre est arrêté (import direct, réserves retirées à la main, dédoublonnage à l'import, contrôle de complétude à la programmation, aucun statut de vérification — voir `docs/modele-donnees.md` §4 et §10). Ce qui reste : un outil d'extraction des parcours existe déjà et sera versé au dépôt ; ce qu'il produit et ce qu'il faut y ajouter se traite à ce moment-là. Les faits de cadrage à respecter sont dans le tableau du §5 et dans `docs/research/wikidata-coverage.md`.
2. **ARM64 ou AMD64 ?** **À trancher au provisionnement, pas avant.** Les 18 images du périmètre publient un manifeste `linux/arm64` officiel (vérifié par inspection des manifestes), GlitchTip inclus, et Coolify supporte ARM64 : l'objection technique est levée, le choix ne bloque donc plus rien. Reste l'arbitrage machine, car il n'existe pas de ligne ARM à vCPU **dédié** chez Hetzner — CAX41 (16 vCPU ARM partagés / 32 Go, ~30 €) contre CCX33 (8 vCPU AMD dédiés / 32 Go, ~60 €), alors que le §8 recommande du dédié pour Postgres et les builds. La sortie est peu coûteuse dans les deux sens : l'image de l'app se reconstruit depuis les sources et tout le reste est multi-arch.
3. **Le dispositif de surveillance en détail** — session dédiée. Ce qui est su : Uptime Kuma tourne sur le VPS qu'il surveille et ne signalera donc pas la panne de cette machine ; il faudra au moins un œil externe. Le reste (quels moniteurs, quelles alertes, quels seuils) se décide en une fois, plus tard.
4. **Réglage d'Umami** — le choix de l'outil est acté, sa configuration et les événements suivis restent à définir.
5. **Rétention de `player_progress`.** Reportée avec le partitionnement (§11) : les deux se décident ensemble, le jour où le volume approche 100 M de lignes.

### Sans objet désormais

- **Formats en réserve** (specs §9 : mercato, hors-série) : le champ `theme` libre les accueille sans migration. Coût aujourd'hui : une colonne, déjà là.
- **Licence des données** : Wikidata est en CC0, aucune contrainte d'attribution. Les blasons de clubs sont un risque assumé (§11) : ils viennent de fr.wikipedia, sont pour l'essentiel sous « marque déposée », et la licence est stockée avec les octets.
