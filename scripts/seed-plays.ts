/**
 * Fabrique des parties factices sur une grille, pour voir à quoi ressemblent
 * les statistiques d'une énigme. **Développement uniquement.**
 *
 *     pnpm db:seed-plays                      # la grille du jour, 120 joueurs
 *     pnpm db:seed-plays --date=2026-09-14    # une autre journée
 *     pnpm db:seed-plays --players=400
 *     pnpm db:seed-plays --clean              # retire ce que ce script a posé
 *
 * ## Pourquoi ce script existe
 *
 * Le panneau d'une énigme ne s'affiche qu'à partir de `MIN_ENIGMA_SAMPLE`
 * parties conclues (`src/shared/enigma-stats.ts`) : sur une base de
 * développement où l'on joue seul, il est donc invisible par construction, et
 * la seule façon de le regarder est d'inventer du monde.
 *
 * ## Ce qu'il écrit, et ce qu'il n'écrit pas
 *
 * Des joueurs, leurs parties, et **leurs agrégats** — les trois, parce que le
 * modèle tient à ce qu'un agrégat soit écrit dans la transaction qui écrit la
 * partie qu'il compte (ADR-0013). Semer les parties sans les compteurs
 * fabriquerait précisément l'incohérence que cet ADR passe une page à interdire,
 * et un jeu de données de démonstration qui ment sur ses propres règles vaut
 * moins que rien.
 *
 * Il n'écrit en revanche **aucune série** au-delà du jour semé : la série se
 * compte sur des journées consécutives, et l'inventer demanderait de semer
 * aussi la veille, et l'avant-veille.
 *
 * ## Il est reconnaissable, donc il se retire
 *
 * Tous les joueurs qu'il crée portent un cookie qui commence par `5eed` et
 * contient la date semée. C'est ce qui rend `--clean` possible et ce qui rend
 * le script **rejouable** : semer deux fois la même journée retire d'abord ce
 * que la première a posé, plutôt que de doubler les chiffres. Les parties et
 * les agrégats partent avec le joueur — les deux tables cascadent.
 *
 * ## Les chiffres ne sont pas aléatoires deux fois
 *
 * Le tirage est un générateur déterministe amorcé par la date : la même
 * commande donne la même grille de chiffres. Une capture d'écran reste donc
 * reproductible, et une forme bizarre peut se regarder deux fois.
 */
import { count, eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

import {
  challengeItems,
  dailyChallenges,
  playerProgress,
  players,
  playerStats,
} from '../src/server/db/schema.ts'
import { enigmaStatsOf } from '../src/server/domain/enigma-stats.ts'
import { enigmaRatePercent } from '../src/shared/enigma-stats.ts'
import { MAX_TRIES } from '../src/shared/play.ts'
import { asPosition, POSITIONS, TITULAIRE } from '../src/shared/schedule.ts'
import type { Position } from '../src/shared/schedule.ts'
import { loadEnvLocal, withPool } from './db.ts'

loadEnvLocal()

const url = process.env.DATABASE_URL
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

const USAGE =
  'Usage: pnpm db:seed-plays [--date=YYYY-MM-DD] [--players=N] [--clean]'

const args = process.argv.slice(2)
const clean = args.includes('--clean')

/** Aujourd'hui à Paris — la même règle que le serveur, et `en-CA` pour la même raison. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function argument(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
}

const date = argument('date') ?? PARIS_DAY.format(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(USAGE)

const population = Number(argument('players') ?? '120')
if (!Number.isInteger(population) || population < 1 || population > 5000) {
  throw new Error(`${USAGE}\n--players attend un entier entre 1 et 5000.`)
}

/**
 * Ce qu'une position fait à ceux qui l'ouvrent.
 *
 * Trois profils inventés à la main, dans l'ordre de difficulté que la position
 * *est* (CONTEXT.md) : l'échauffement se trouve, la légende se rate. Rien ici
 * ne prétend décrire de vrais joueurs — c'est un décor, choisi pour que les
 * trois panneaux ne se ressemblent pas et qu'on voie tout de suite si la forme
 * se lit.
 *
 * `opens` est la part de joueurs qui ouvrent le niveau : tout le monde ouvre le
 * premier, et les suivants perdent du monde en route. C'est ce qui fait que les
 * trois énigmes d'une même grille n'ont pas le même dénominateur, comme dans la
 * vraie vie.
 *
 * `tries` répartit les **réussites** par nombre d'essais, dans l'ordre 1 à 6.
 */
type Profile = {
  opens: number
  solved: number
  abandoned: number
  tries: readonly number[]
}

const PROFILES = new Map<Position, Profile>([
  [1, { opens: 1, solved: 0.78, abandoned: 0.04, tries: [30, 25, 18, 13, 9, 5] }],
  [2, { opens: 0.86, solved: 0.52, abandoned: 0.07, tries: [12, 18, 22, 22, 16, 10] }],
  [3, { opens: 0.68, solved: 0.23, abandoned: 0.11, tries: [5, 9, 15, 22, 25, 24] }],
])

/**
 * Un générateur pseudo-aléatoire amorcé par la date — mulberry32, quatre
 * lignes, et sa seule qualité recherchée est d'être le même demain.
 */
function randomFrom(seed: string): () => number {
  let state = 0x9e3779b9
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 0x85ebca6b) >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = randomFrom(date)

/** Tire un rang dans une répartition de poids : ici, un nombre d'essais. */
function pick(weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let drawn = random() * total

  for (const [index, weight] of weights.entries()) {
    drawn -= weight
    if (drawn < 0) return index + 1
  }

  return weights.length
}

/**
 * Le cookie d'un joueur semé : un UUID en apparence, une étiquette en réalité.
 *
 * `5eed` en tête et la date au milieu, parce que c'est ce couple qui permet de
 * retrouver exactement ce que ce script a posé sur cette journée-là, et rien
 * d'autre. La forme reste celle qu'`isPlayerCookieId` accepte — sinon ces
 * lignes ne seraient pas des joueurs que l'application saurait relire.
 */
const cookiePrefix = `5eed0000-${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-8000-`
const cookieId = (index: number) => `${cookiePrefix}${index.toString(16).padStart(12, '0')}`

/** Les bornes de la journée semée, pour que les parties aient une heure crédible. */
const dayStart = Date.parse(`${date}T06:00:00Z`)
const dayEnd = Math.max(dayStart, Math.min(Date.parse(`${date}T22:00:00Z`), Date.now()))
const someTime = () => new Date(dayStart + random() * (dayEnd - dayStart))

/** Une partie ne se termine pas à la seconde où elle s'ouvre : une minute par essai. */
const minutesLater = (from: Date, minutes: number) =>
  new Date(from.getTime() + 60_000 * minutes)

/** Une énigme de la journée semée, réduite à ce que le tirage lui demande. */
type SeededEnigma = { id: string; position: Position }

type Partie = typeof playerProgress.$inferInsert

/**
 * Ce qu'un joueur fait d'une énigme : une partie, ou rien du tout.
 *
 * Trois issues, dans l'ordre où un joueur les rencontre — il trouve, il laisse
 * tomber, ou il brûle ses six essais — plus la quatrième qui n'écrit rien :
 * il n'a jamais ouvert ce niveau, et **une énigme jamais ouverte n'a pas de
 * partie** (`docs/modele-donnees.md` §4). C'est cette absence-là qui mesure les
 * gens exposés à une énigme, donc c'est elle qu'il faut savoir semer.
 */
function partieOf(enigma: SeededEnigma, playerId: string): Partie | null {
  const profile = PROFILES.get(enigma.position)
  if (profile === undefined || random() > profile.opens) return null

  const openedAt = someTime()
  const common = { challengeItemId: enigma.id, playerId, mode: 'daily' as const, openedAt }
  const draw = random()

  if (draw < profile.solved) {
    const triesUsed = pick(profile.tries)
    return { ...common, triesUsed, status: 'solved', finishedAt: minutesLater(openedAt, triesUsed) }
  }

  // Ouverte et laissée là. Elle ne compte nulle part tant que la grille est
  // celle du jour, et devient un échec dès qu'elle a tourné — par règle de
  // lecture, et sans que rien ne l'écrive (`src/server/domain/play.ts`).
  if (draw < profile.solved + profile.abandoned) {
    return { ...common, triesUsed: Math.floor(random() * MAX_TRIES), status: 'in_progress' }
  }

  return {
    ...common,
    triesUsed: MAX_TRIES,
    status: 'failed',
    finishedAt: minutesLater(openedAt, MAX_TRIES),
  }
}

/**
 * La journée d'un joueur : ses parties, et l'agrégat qui les compte.
 *
 * Les deux sortent ensemble parce qu'ils s'écrivent ensemble (ADR-0013) : un
 * agrégat calculé ailleurs que là où les parties sont tirées serait un second
 * endroit où se tromper, sur des chiffres que rien ne vient réparer.
 */
function dayOf(
  playerId: string,
  enigmas: readonly SeededEnigma[],
): { parties: Partie[]; aggregate: typeof playerStats.$inferInsert | null } {
  const drawn: { enigma: SeededEnigma; partie: Partie }[] = []

  for (const enigma of enigmas) {
    const partie = partieOf(enigma, playerId)
    if (partie !== null) drawn.push({ enigma, partie })
  }

  const parties = drawn.map(({ partie }) => partie)
  if (drawn.length === 0) return { parties, aggregate: null }

  const solved = drawn.filter(({ partie }) => partie.status === 'solved')
  const titulaire = solved.some(({ enigma }) => enigma.position === TITULAIRE)

  return {
    parties,
    aggregate: {
      playerId,
      mode: 'daily',
      // Toute partie ouverte compte comme jouée, abandonnée comprise (specs §5).
      playedCount: drawn.length,
      solvedCount: solved.length,
      perfectChallenges: solved.length === POSITIONS.length ? 1 : 0,
      // Un seul jour semé, donc une série d'un jour au plus : elle n'a de sens
      // qu'avec la date qui la porte, et c'est celle-ci.
      currentStreak: titulaire ? 1 : 0,
      bestStreak: titulaire ? 1 : 0,
      lastSolvedChallenge: titulaire ? date : null,
    },
  }
}

/**
 * Ce que le panneau d'une énigme affichera, relu depuis la base.
 *
 * Les tas puis `enigmaStatsOf`, c'est-à-dire la requête du service et le pli du
 * domaine (`server/services/enigma-stats.service.ts`) : ce script existe pour
 * qu'on regarde le panneau, donc il doit compter comme lui. Le même tri
 * réécrit ici aurait fini par annoncer un taux que l'écran ne montre pas, et
 * c'est le seul mensonge qu'un script de démonstration puisse vraiment dire.
 */
async function report(
  handle: ReturnType<typeof drizzle>,
  enigmas: readonly SeededEnigma[],
): Promise<string[]> {
  const today = PARIS_DAY.format(new Date())
  const lines: string[] = []

  for (const enigma of enigmas) {
    const tallies = await handle
      .select({
        status: playerProgress.status,
        mode: playerProgress.mode,
        triesUsed: playerProgress.triesUsed,
        parties: count(),
      })
      .from(playerProgress)
      .where(eq(playerProgress.challengeItemId, enigma.id))
      .groupBy(playerProgress.status, playerProgress.mode, playerProgress.triesUsed)

    const stats = enigmaStatsOf(tallies, { gridDate: date, today })
    const rate = enigmaRatePercent(stats)
    // Pas de taux sans parties conclues : `enigmaRatePercent` rend `null`, et un
    // tiret le dit mieux qu'un « 0 % » qui se lirait comme une énigme ratée par
    // tout le monde.
    const share = rate === null ? '—' : `${String(rate)} %`

    lines.push(
      `  position ${String(enigma.position)} : ${String(stats.finishedCount)} parties conclues, ${share} de réussite`,
    )
  }

  return lines
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  )
}

await withPool(url, async (pool) => {
  const db = drizzle(pool)

  // D'abord retirer : c'est ce qui rend le script rejouable, et c'est aussi
  // tout ce que `--clean` fait.
  const removed = await db
    .delete(players)
    .where(like(players.cookieId, `${cookiePrefix}%`))
    .returning({ id: players.id })

  if (clean) {
    console.log(`${String(removed.length)} joueur(s) semé(s) retiré(s) pour le ${date}.`)
    return
  }

  const rows = await db
    .select({ id: challengeItems.id, position: challengeItems.position })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(eq(dailyChallenges.date, date))

  if (rows.length === 0) {
    throw new Error(
      `Aucune grille programmée le ${date}. Programmez-la dans le back-office, puis relancez.`,
    )
  }

  // La colonne est un entier, le rang d'une énigme ne l'est pas : `asPosition`
  // est le seul endroit qui dit lesquels existent (`shared/schedule.ts`), et
  // une ligne hors des trois est une grille cassée qu'il vaut mieux nommer ici
  // que semer à moitié.
  const enigmas: SeededEnigma[] = rows.map((row) => {
    const position = asPosition(row.position)
    if (position === null) {
      throw new Error(`Position ${String(row.position)} inconnue sur la grille du ${date}.`)
    }

    return { id: row.id, position }
  })

  const seeded = await db
    .insert(players)
    .values(
      Array.from({ length: population }, (_, index) => ({
        cookieId: cookieId(index),
        // Une date de dernière vue cohérente avec la journée jouée : la purge
        // des vieux joueurs ne lit que cette colonne.
        lastSeenAt: new Date(dayEnd),
      })),
    )
    .returning({ id: players.id })

  const parties: Partie[] = []
  const aggregates: (typeof playerStats.$inferInsert)[] = []

  for (const player of seeded) {
    const day = dayOf(player.id, enigmas)
    parties.push(...day.parties)
    if (day.aggregate !== null) aggregates.push(day.aggregate)
  }

  // Par paquets : une seule instruction de dix mille valeurs dépasse la limite
  // de paramètres du protocole Postgres.
  for (const chunk of chunks(parties, 500)) await db.insert(playerProgress).values(chunk)
  for (const chunk of chunks(aggregates, 500)) await db.insert(playerStats).values(chunk)

  const dated = argument('date') === undefined ? '' : ` --date=${date}`

  console.log(
    [
      `Grille du ${date} : ${String(seeded.length)} joueurs semés, ${String(parties.length)} parties.`,
      ...(await report(db, enigmas)),
      `À retirer avec : pnpm db:seed-plays --clean${dated}`,
    ].join('\n'),
  )
})
