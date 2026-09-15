import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { players, playerProgress } from '@/server/db/schema'
import { archiveCalendarAt, archiveScreenAt } from '@/server/services/archive.service'
import { GridRefusedError, getDayPlays, submitTry } from '@/server/services/play.service'
import { scheduleGrid } from '@/server/services/schedule.service'
import { getPlayerStats, getPlayerStatsOfGrid } from '@/server/services/stats.service'
import type { Position } from '@/shared/schedule'

import { db } from '@test/setup/db'
import { ACCOUNT_IDS, seedAccounts } from '@test/fixtures/accounts'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * L'archive contre un vrai Postgres : rejouer les jours passés, et ce que ça ne
 * doit surtout pas rapporter.
 *
 * Cinq propriétés portent le ticket, et aucune n'est une question de requête :
 *
 * - **Les sept derniers jours se rejouent sans compte**, et le huitième
 *   demande un compte (specs §7). C'est la première raison concrète de
 *   s'inscrire, donc le refus est nommé plutôt que muet.
 * - **Une partie d'archive n'alimente ni la série ni les cartons pleins du
 *   quotidien**, « sinon une série de 200 jours se reconstruit en une soirée ».
 *   La démonstration se fait sur la ligne `player_stats` du quotidien, restée
 *   intacte pendant qu'on gagne trois grilles d'archive.
 * - **Les statistiques d'archive sont comptées séparément** : deux lignes, une
 *   par mode, et rien ne les additionne jamais.
 * - **Une grille déjà jouée reste consultable et n'est pas rejouable.** Une
 *   partie terminée l'est pour de bon, en archive comme dans le quotidien, et
 *   elle montre sa réponse.
 * - **Une grille à venir n'existe pas.** Elles sont programmées à l'avance,
 *   donc c'est le seul endroit par lequel l'énigme de demain pouvait fuir.
 */
const TODAY = '2026-09-15'
/** Dans les sept jours ouverts — le dernier, celui qui borne la fenêtre. */
const OPEN_DAY = '2026-09-08'
/** Le huitième jour : celui qui demande un compte. */
const LOCKED_DAY = '2026-09-07'
const TOMORROW = '2026-09-16'

const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

const answerAt = (position: Position) => SCHEDULABLE[position - 1] ?? null
const WRONG = FOOTBALLER_IDS.incomplete

const schedule = async (date: string, theme = 'standard') =>
  await scheduleGrid({ date, theme, footballerIds: SCHEDULABLE })

function paris(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T11:00:00Z`))
}

const open = async (position: Position, date: string) =>
  await getDayPlays({ playerId: PLAYER_IDS.mine, date, open: position })

const tryOne = async (position: Position, footballerId: string | null, date: string) =>
  await submitTry({ playerId: PLAYER_IDS.mine, date, position, footballerId })

/** Ouvre l'énigme et la trouve. La seule porte, comme partout ailleurs. */
async function solve(position: Position, date: string): Promise<void> {
  await open(position, date)
  vi.advanceTimersByTime(5_000)
  await tryOne(position, answerAt(position), date)
}

/** Les trois énigmes d'une grille trouvées — un carton plein. */
async function solveAll(date: string): Promise<void> {
  for (const position of [1, 2, 3] as const) await solve(position, date)
}

/** Pose un compte sur le joueur : c'est ce qu'ouvre la reprise de progression. */
async function signIn(): Promise<void> {
  await seedAccounts(db)
  await db
    .update(players)
    .set({ authUserId: ACCOUNT_IDS.mine })
    .where(eq(players.id, PLAYER_IDS.mine))
}

const statsOf = async (mode: 'daily' | 'archive') =>
  await getPlayerStats(PLAYER_IDS.mine, mode)

beforeEach(async () => {
  await seedCatalogue(db)
  await seedPlayers(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('jusqu’où on rejoue sans compte', () => {
  it('ouvre les sept derniers jours à tout le monde', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: OPEN_DAY, open: 2 })

    expect(day.plays).toMatchObject([{ position: 2, status: 'in_progress' }])
  })

  it('demande un compte au-delà, et le dit', async () => {
    await schedule(LOCKED_DAY)
    paris(TODAY)

    await expect(
      getDayPlays({ playerId: PLAYER_IDS.mine, date: LOCKED_DAY, open: 2 }),
    ).rejects.toThrow(GridRefusedError)
    await expect(
      getDayPlays({ playerId: PLAYER_IDS.mine, date: LOCKED_DAY, open: 2 }),
    ).rejects.toMatchObject({ reason: 'account-required' })

    // Refusée veut dire qu'il ne s'est rien passé : pas de partie créée en
    // chemin, donc rien à compter et rien à reprendre.
    expect(await db.select().from(playerProgress)).toEqual([])
  })

  it('ouvre tout au joueur qui a un compte', async () => {
    await schedule(LOCKED_DAY)
    await signIn()
    paris(TODAY)

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: LOCKED_DAY, open: 2 })

    expect(day.plays).toMatchObject([{ position: 2, status: 'in_progress' }])
  })

  it('refuse aussi l’essai, et pas seulement l’ouverture', async () => {
    // Une partie d'archive n'a pas d'échéance : elle reste ouverte
    // indéfiniment, donc la porte de l'essai est le seul mur devant quelqu'un
    // qui a perdu son compte entre-temps.
    await schedule(LOCKED_DAY)
    await signIn()
    paris(TODAY)
    await open(2, LOCKED_DAY)

    await db.update(players).set({ authUserId: null }).where(eq(players.id, PLAYER_IDS.mine))

    await expect(tryOne(2, answerAt(2), LOCKED_DAY)).rejects.toMatchObject({
      reason: 'account-required',
    })
  })
})

describe('une grille à venir', () => {
  it('ne se lit pas, même programmée', async () => {
    await schedule(TOMORROW)
    paris(TODAY)

    await expect(
      getDayPlays({ playerId: PLAYER_IDS.mine, date: TOMORROW }),
    ).rejects.toMatchObject({ reason: 'not-yet' })
  })

  it('ne s’ouvre pas davantage avec un compte', async () => {
    await schedule(TOMORROW)
    await signIn()
    paris(TODAY)

    await expect(
      getDayPlays({ playerId: PLAYER_IDS.mine, date: TOMORROW }),
    ).rejects.toMatchObject({ reason: 'not-yet' })
  })
})

describe('ce qu’une partie d’archive ne rapporte pas', () => {
  it('n’avance pas la série du quotidien, même en gagnant des jours de suite', async () => {
    // Le cas que la règle existe pour refuser : trois titulaires d'affilée en
    // archive, et la série du quotidien reste à zéro.
    await schedule('2026-09-14')
    await schedule('2026-09-13')
    await schedule('2026-09-12')
    paris(TODAY)

    for (const date of ['2026-09-12', '2026-09-13', '2026-09-14']) await solve(2, date)

    expect(await statsOf('daily')).toMatchObject({ serie: 0, solvedCount: 0, playedCount: 0 })
  })

  it('n’avance pas non plus la série de l’archive : elle n’y existe pas', async () => {
    await schedule('2026-09-14')
    await schedule('2026-09-13')
    paris(TODAY)

    for (const date of ['2026-09-13', '2026-09-14']) await solve(2, date)

    expect(await statsOf('archive')).toMatchObject({ serie: 0, bestSerie: 0, solvedCount: 2 })
  })

  it('n’ajoute pas de carton plein au quotidien', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)

    await solveAll(OPEN_DAY)

    expect(await statsOf('daily')).toMatchObject({ perfectChallenges: 0, playedCount: 0 })
  })

  it('compte son propre carton plein, sur sa propre ligne', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)

    await solveAll(OPEN_DAY)

    expect(await statsOf('archive')).toMatchObject({
      perfectChallenges: 1,
      playedCount: 3,
      solvedCount: 3,
    })
  })
})

describe('les deux histoires d’un même joueur', () => {
  it('se comptent séparément, et rien ne les additionne', async () => {
    await schedule(TODAY)
    await schedule(OPEN_DAY)
    paris(TODAY)

    await solve(2, TODAY)
    await solveAll(OPEN_DAY)

    expect(await statsOf('daily')).toMatchObject({
      playedCount: 1,
      solvedCount: 1,
      serie: 1,
      perfectChallenges: 0,
    })
    expect(await statsOf('archive')).toMatchObject({
      playedCount: 3,
      solvedCount: 3,
      serie: 0,
      perfectChallenges: 1,
    })
  })

  it('rangent la répartition par nombre d’essais chacune de son côté', async () => {
    await schedule(TODAY)
    await schedule(OPEN_DAY)
    paris(TODAY)

    await solve(1, TODAY)
    await open(1, OPEN_DAY)
    vi.advanceTimersByTime(5_000)
    await tryOne(1, WRONG, OPEN_DAY)
    vi.advanceTimersByTime(5_000)
    await tryOne(1, answerAt(1), OPEN_DAY)

    // Trouvé du premier coup dans le quotidien, du deuxième en archive.
    expect((await statsOf('daily')).solvedByTries).toEqual([1, 0, 0, 0, 0, 0])
    expect((await statsOf('archive')).solvedByTries).toEqual([0, 1, 0, 0, 0, 0])
  })
})

describe('une grille d’archive déjà jouée', () => {
  it('reste consultable, avec sa réponse', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)
    await solve(2, OPEN_DAY)

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: OPEN_DAY })

    expect(day.plays).toMatchObject([{ position: 2, status: 'solved' }])
    expect(day.plays[0]?.answer).not.toBeNull()
  })

  it('n’est pas rejouable : l’essai suivant est refusé', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)
    await solve(2, OPEN_DAY)
    vi.advanceTimersByTime(5_000)

    await expect(tryOne(2, WRONG, OPEN_DAY)).rejects.toMatchObject({ reason: 'over' })
  })

  it('ne compte pas une seconde fois quand on la rouvre', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)
    await solve(2, OPEN_DAY)

    await open(2, OPEN_DAY)

    expect(await statsOf('archive')).toMatchObject({ playedCount: 1, solvedCount: 1 })
  })
})

describe('une partie d’archive laissée en cours', () => {
  it('n’est pas emportée par le changement de jour', async () => {
    // Le contraire exact de la grille du jour : celle-ci devient un échec au
    // changement de grille, l'archive n'a pas d'échéance puisqu'elle ne compte
    // pour rien (`server/domain/play.ts`).
    await schedule('2026-09-14')
    paris(TODAY)
    await open(2, '2026-09-14')

    // Quatre jours plus tard : la grille est toujours dans la fenêtre ouverte,
    // donc ce qui est affirmé ici est bien la lecture et non le droit d'entrer.
    paris('2026-09-18')
    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: '2026-09-14' })

    expect(day.plays).toMatchObject([{ position: 2, status: 'in_progress' }])
  })
})

describe('l’écran d’une journée passée', () => {
  it('donne la grille quand elle est ouverte', async () => {
    await schedule(OPEN_DAY, 'rétro')

    const screen = await archiveScreenAt(OPEN_DAY, TODAY, false)

    expect(screen).toMatchObject({ kind: 'grid', grid: { date: OPEN_DAY, theme: 'rétro' } })
  })

  it('dit le cadenas plutôt que le vide quand il manque un compte', async () => {
    await schedule(LOCKED_DAY)

    expect(await archiveScreenAt(LOCKED_DAY, TODAY, false)).toEqual({
      today: TODAY,
      kind: 'account-required',
    })
    expect(await archiveScreenAt(LOCKED_DAY, TODAY, true)).toMatchObject({ kind: 'grid' })
  })

  it('distingue le jour sans grille du jour verrouillé', async () => {
    expect(await archiveScreenAt(OPEN_DAY, TODAY, false)).toEqual({
      today: TODAY,
      kind: 'no-grid',
    })
  })

  it('refuse un jour à venir sans même lire sa grille', async () => {
    await schedule(TOMORROW)

    expect(await archiveScreenAt(TOMORROW, TODAY, true)).toEqual({
      today: TODAY,
      kind: 'not-yet',
    })
  })

  it('renvoie aujourd’hui ailleurs plutôt que de le rejouer ici', async () => {
    // Ce n'est pas un refus : la grille du jour se joue, mais à son adresse à
    // elle, où elle alimente la série. La rejouer sous une adresse d'archive
    // l'aurait montrée sous un en-tête qui cache la série tout en l'avançant.
    await schedule(TODAY)

    expect(await archiveScreenAt(TODAY, TODAY, false)).toEqual({ today: TODAY, kind: 'today' })
  })
})

describe('la porte des statistiques', () => {
  it('déduit le mode de la date, et répond le quotidien sans date', async () => {
    await schedule(TODAY)
    await schedule(OPEN_DAY)
    paris(TODAY)

    await solve(2, TODAY)
    await solveAll(OPEN_DAY)

    expect(await getPlayerStatsOfGrid(PLAYER_IDS.mine, null)).toMatchObject({ solvedCount: 1 })
    expect(await getPlayerStatsOfGrid(PLAYER_IDS.mine, TODAY)).toMatchObject({ solvedCount: 1 })
    expect(await getPlayerStatsOfGrid(PLAYER_IDS.mine, OPEN_DAY)).toMatchObject({
      solvedCount: 3,
      perfectChallenges: 1,
    })
  })

  it('répond les chiffres d’archive d’un jour verrouillé : lire n’est pas jouer', async () => {
    await schedule(OPEN_DAY)
    paris(TODAY)
    await solve(2, OPEN_DAY)

    expect(await getPlayerStatsOfGrid(PLAYER_IDS.mine, LOCKED_DAY)).toMatchObject({
      solvedCount: 1,
    })
  })
})

describe('l’index de l’archive', () => {
  it('donne le mois entier, trous compris', async () => {
    const calendar = await archiveCalendarAt('2026-09', TODAY, false)

    expect(calendar.days).toHaveLength(30)
    expect(calendar.days.every((day) => day.theme === null)).toBe(true)
  })

  it('nomme le thème d’un jour passé et laisse jouer dans la fenêtre ouverte', async () => {
    await schedule(OPEN_DAY, 'mercato')

    const calendar = await archiveCalendarAt('2026-09', TODAY, false)

    expect(calendar.days.find((day) => day.date === OPEN_DAY)).toEqual({
      date: OPEN_DAY,
      theme: 'mercato',
      reach: 'open',
      playable: true,
    })
  })

  it('montre le jour verrouillé sans le rendre jouable, et l’ouvre avec un compte', async () => {
    await schedule(LOCKED_DAY, 'rétro')

    const locked = await archiveCalendarAt('2026-09', TODAY, false)
    const opened = await archiveCalendarAt('2026-09', TODAY, true)

    expect(locked.days.find((day) => day.date === LOCKED_DAY)).toMatchObject({
      theme: 'rétro',
      reach: 'account',
      playable: false,
    })
    expect(opened.days.find((day) => day.date === LOCKED_DAY)).toMatchObject({
      playable: true,
    })
  })

  it('ne dit rien d’une grille à venir, pas même son thème', async () => {
    await schedule(TOMORROW, 'hors-série')

    const calendar = await archiveCalendarAt('2026-09', TODAY, true)

    expect(calendar.days.find((day) => day.date === TOMORROW)).toEqual({
      date: TOMORROW,
      theme: null,
      reach: 'future',
      playable: false,
    })
  })

  it('ne renvoie pas la grille du jour sur l’archive', async () => {
    // Elle a son adresse à elle, et elle compte : la rejouer depuis l'archive
    // serait le même jour compté deux fois, dans deux modes.
    await schedule(TODAY)

    const calendar = await archiveCalendarAt('2026-09', TODAY, true)

    expect(calendar.days.find((day) => day.date === TODAY)).toMatchObject({
      reach: 'today',
      playable: false,
    })
  })

  it('n’ouvre aucun mois devant le mois courant', async () => {
    const current = await archiveCalendarAt('2026-09', TODAY, false)
    const past = await archiveCalendarAt('2026-07', TODAY, false)

    expect(current.nextMonth).toBeNull()
    expect(current.previousMonth).toBe('2026-08')
    expect(past.nextMonth).toBe('2026-08')
  })
})
