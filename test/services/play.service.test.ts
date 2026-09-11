import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { challengeItems, dailyChallenges, playerProgress } from '@/server/db/schema'
import { getDayPlays } from '@/server/services/play.service'
import { scheduleGrid } from '@/server/services/schedule.service'
import type { Position } from '@/shared/schedule'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * La partie, against a real Postgres: born when an enigma is opened, found
 * again on the next request, and read as a failure once its grid has turned.
 *
 * Three properties carry the ticket, and none of them is about a query:
 *
 * - **Opening creates, and creates once.** A partie exists for the people
 *   *exposed* to an enigma, not for the people who tried, because that is what
 *   the difficulty calibration reads (#12). Which makes the second half of the
 *   sentence load-bearing: a reload, a second tab and a double request must not
 *   make a second partie, and it is the unique index that says so rather than a
 *   check in the service.
 * - **Reading is not opening.** The state of a grid comes back whole, and an
 *   enigma the joueur has never unfolded stays absent from it. An endpoint that
 *   opened what it reads would count three people where one arrived.
 * - **A partie the day took away is a failure, and no job wrote it.** The row
 *   still says `in_progress` afterwards; that is asserted here, because "there
 *   is no midnight job" is only observable as the row being untouched.
 */
const TODAY = '2026-09-09'
const YESTERDAY = '2026-09-08'

/** Three footballers the catalogue fixture leaves fully schedulable. */
const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

const schedule = async (date: string) =>
  await scheduleGrid({ date, theme: 'standard', footballerIds: SCHEDULABLE })

/** The clock the service reads. Every date in this file is a Paris date. */
function paris(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T11:00:00Z`))
}

const mine = (over: { date?: string; open?: Position } = {}) =>
  ({ playerId: PLAYER_IDS.mine, date: TODAY, ...over })

/** Every partie in the database, whoever it belongs to. */
async function allParties() {
  return await db.select().from(playerProgress)
}

/**
 * The `challenge_items` row at one position of a grid — the enigma's identity.
 *
 * Which is a thing a test has business knowing about here and nowhere else: a
 * partie hangs off that row by a cascade, so whether reprogramming a day keeps
 * the row or replaces it decides whether the day's parties survive.
 */
async function enigmaId(date: string, position: Position): Promise<string> {
  const rows = await db
    .select({ id: challengeItems.id })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(and(eq(dailyChallenges.date, date), eq(challengeItems.position, position)))

  const found = rows[0]
  if (found === undefined) throw new Error(`No enigma at position ${position} of ${date}.`)
  return found.id
}

beforeEach(async () => {
  await seedCatalogue(db)
  await seedPlayers(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('opening an enigma', () => {
  it('creates the partie, with nothing spent on it yet', async () => {
    await schedule(TODAY)
    paris(TODAY)

    const day = await getDayPlays(mine({ open: 1 }))

    expect(day.plays).toEqual([
      { position: 1, triesUsed: 0, status: 'in_progress', hints: [], answer: null },
    ])
  })

  it('creates it in the quotidien, which is the only mode that counts', async () => {
    await schedule(TODAY)
    paris(TODAY)

    await getDayPlays(mine({ open: 1 }))

    const [partie] = await allParties()
    expect(partie).toMatchObject({ mode: 'daily', triesUsed: 0, status: 'in_progress' })
    expect(partie?.finishedAt).toBeNull()
  })

  it('opens only the enigma asked for, and never the other two', async () => {
    // The whole reason the three enigmas do not unfold at once: three parties
    // born together would measure three people exposed where one arrived.
    await schedule(TODAY)
    paris(TODAY)

    const day = await getDayPlays(mine({ open: 2 }))

    expect(day.plays.map((play) => play.position)).toEqual([2])
    expect(await allParties()).toHaveLength(1)
  })

  it('is idempotent: opening the same enigma again is the same partie', async () => {
    await schedule(TODAY)
    paris(TODAY)

    await getDayPlays(mine({ open: 1 }))
    await getDayPlays(mine({ open: 1 }))

    expect(await allParties()).toHaveLength(1)
  })

  it('makes one partie out of a burst of simultaneous opens', async () => {
    // Two tabs, a double-tap on the fold, a client that retries: the guard is
    // the unique index and not a read-then-write in the service, which is
    // exactly what a race would slip between.
    await schedule(TODAY)
    paris(TODAY)

    await Promise.all(
      Array.from({ length: 8 }, async () => await getDayPlays(mine({ open: 1 }))),
    )

    expect(await allParties()).toHaveLength(1)
  })

  it('keeps the essais already spent — it never resets a partie', async () => {
    // What a reload does. The essai itself is #9's, so the spending is written
    // here by hand; what is asserted is that opening an enigma a second time
    // reads the partie back rather than starting it over.
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays(mine({ open: 1 }))
    await db.update(playerProgress).set({ triesUsed: 3 })

    const day = await getDayPlays(mine({ open: 1 }))

    expect(day.plays).toMatchObject([{ position: 1, triesUsed: 3, status: 'in_progress' }])
  })

  it('creates nothing on a date that is not the grid of the day', async () => {
    // The page is prerendered and served from a shared cache for up to a minute
    // (ADR-0008), so a joueur arriving at midnight can be holding a grid that
    // has just turned. Opening an enigma of it would create a partie on
    // yesterday's grid — one that the reading rule fails on the spot.
    await schedule(YESTERDAY)
    await schedule(TODAY)
    paris(TODAY)

    const day = await getDayPlays(mine({ date: YESTERDAY, open: 1 }))

    expect(day.plays).toEqual([])
    expect(await allParties()).toEqual([])
  })

  it('creates nothing when the date has no grid at all', async () => {
    paris(TODAY)

    const day = await getDayPlays(mine({ open: 1 }))

    expect(day.plays).toEqual([])
    expect(await allParties()).toEqual([])
  })

  it('creates nothing for a position the grid does not have', async () => {
    // Only reachable by hand — the client sends a position it read off the
    // grid. It answers rather than throws: a request naming an enigma that is
    // not there is the same non-event as a date with no grid.
    await schedule(TODAY)
    paris(TODAY)
    await db.delete(challengeItems).where(eq(challengeItems.position, 3))

    const day = await getDayPlays(mine({ open: 3 }))

    expect(day.plays).toEqual([])
    expect(await allParties()).toEqual([])
  })
})

describe('reading the state of a grid', () => {
  it('creates nothing when nothing is being opened', async () => {
    await schedule(TODAY)
    paris(TODAY)

    const day = await getDayPlays(mine())

    expect(day.plays).toEqual([])
    expect(await allParties()).toEqual([])
  })

  it('gives back every partie of the grid, in position order', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays(mine({ open: 3 }))
    await getDayPlays(mine({ open: 1 }))

    const day = await getDayPlays(mine())

    expect(day.plays.map((play) => play.position)).toEqual([1, 3])
  })

  it('says which grid it is about, and which day the server thinks it is', async () => {
    await schedule(TODAY)
    paris(TODAY)

    // Both, because they can differ: the client reads the date off a page that
    // may be a minute older than the day.
    expect(await getDayPlays(mine({ date: YESTERDAY }))).toMatchObject({
      date: YESTERDAY,
      today: TODAY,
    })
  })

  it('turns the day at Paris midnight, not at UTC midnight', async () => {
    await schedule(TODAY)
    vi.useFakeTimers({ toFake: ['Date'] })

    // 21:59 UTC is 23:59 in Paris in September: still the 9th.
    vi.setSystemTime(new Date('2026-09-09T21:59:00Z'))
    expect((await getDayPlays(mine())).today).toBe(TODAY)

    vi.setSystemTime(new Date('2026-09-09T22:00:00Z'))
    expect((await getDayPlays(mine())).today).toBe('2026-09-10')
  })

  it('never reads another joueur’s partie', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays({ playerId: PLAYER_IDS.other, date: TODAY, open: 2 })

    const day = await getDayPlays(mine())

    expect(day.plays).toEqual([])
    expect(await allParties()).toHaveLength(1)
  })

  it('gives each joueur his own partie on the same enigma', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays(mine({ open: 1 }))
    await getDayPlays({ playerId: PLAYER_IDS.other, date: TODAY, open: 1 })
    await db
      .update(playerProgress)
      .set({ triesUsed: 5 })
      .where(eq(playerProgress.playerId, PLAYER_IDS.other))

    expect((await getDayPlays(mine())).plays).toEqual([
      { position: 1, triesUsed: 0, status: 'in_progress', hints: [], answer: null },
    ])
    expect(await allParties()).toHaveLength(2)
  })
})

describe('a partie whose grid is no longer the grid of the day', () => {
  it('is read as a failure', async () => {
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await getDayPlays(mine({ date: YESTERDAY, open: 1 }))

    paris(TODAY)
    const day = await getDayPlays(mine({ date: YESTERDAY }))

    expect(day.plays).toMatchObject([{ position: 1, triesUsed: 0, status: 'failed' }])
  })

  it('is failed by the reading and not by a job: the row is untouched', async () => {
    // « Par règle de lecture et non par un job » (docs/modele-donnees.md §4).
    // Nothing runs at midnight, so the only way to observe the absence of that
    // job is that the stored status still says the partie is open.
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await getDayPlays(mine({ date: YESTERDAY, open: 1 }))

    paris(TODAY)
    await getDayPlays(mine({ date: YESTERDAY }))

    const [partie] = await allParties()
    expect(partie).toMatchObject({ status: 'in_progress' })
    expect(partie?.finishedAt).toBeNull()
  })

  it('does not touch a partie that was already finished', async () => {
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await getDayPlays(mine({ date: YESTERDAY, open: 1 }))
    await db
      .update(playerProgress)
      .set({ status: 'solved', triesUsed: 2, finishedAt: new Date() })

    paris(TODAY)
    const day = await getDayPlays(mine({ date: YESTERDAY }))

    // Everything ever solved sits on a grid that is no longer the day's.
    expect(day.plays).toMatchObject([{ position: 1, triesUsed: 2, status: 'solved' }])
  })
})

describe('a grid the admin reprogrammes', () => {
  it('keeps the parties of the positions he did not change', async () => {
    // `scheduleGrid` corrects a day by rewriting it, and a partie cascades from
    // its enigma: rewriting the three rows on a theme correction would delete
    // every partie of the day, for everybody, at any hour. So a position whose
    // footballer has not changed keeps its row.
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays(mine({ open: 1 }))
    await getDayPlays(mine({ open: 2 }))

    await scheduleGrid({ date: TODAY, theme: 'rétro', footballerIds: SCHEDULABLE })

    const day = await getDayPlays(mine())
    expect(day.plays.map((play) => play.position)).toEqual([1, 2])
  })

  it('takes away the partie of a position whose footballer changed', async () => {
    // The other half of the same decision: the enigma at position 2 is now a
    // different question, so a partie carrying four essais spent on the
    // previous footballer is not a partie on this one.
    await schedule(TODAY)
    paris(TODAY)
    await getDayPlays(mine({ open: 1 }))
    await getDayPlays(mine({ open: 2 }))

    // The same three footballers, positions 2 and 3 swapped: position 1 is
    // untouched, the other two now ask a different question each.
    await scheduleGrid({
      date: TODAY,
      theme: 'standard',
      footballerIds: [
        FOOTBALLER_IDS.complete,
        FOOTBALLER_IDS.loan,
        FOOTBALLER_IDS.untypedReserve,
      ],
    })

    const day = await getDayPlays(mine())
    expect(day.plays.map((play) => play.position)).toEqual([1])
  })

  it('leaves the enigmas it kept exactly where they were', async () => {
    await schedule(TODAY)
    const before = await enigmaId(TODAY, 1)

    await scheduleGrid({ date: TODAY, theme: 'mercato', footballerIds: SCHEDULABLE })

    expect(await enigmaId(TODAY, 1)).toBe(before)
  })
})
