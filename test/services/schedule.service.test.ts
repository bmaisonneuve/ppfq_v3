import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { challengeItems, dailyChallenges, footballers, playerClubs } from '@/server/db/schema'
import { FootballerNotFoundError } from '@/server/services/curation.service'
import {
  NotSchedulableError,
  getMonthCalendar,
  getSchedulingScreen,
  listThemes,
  scheduleGrid,
} from '@/server/services/schedule.service'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, PASSAGE_IDS, seedCatalogue } from '@test/fixtures/catalogue'

/**
 * The scheduling seam: programmer une journée, called the way the calendar
 * calls it, against a real Postgres.
 *
 * Two things are being tested and they are not the same. One is that a grid is
 * three designations and a date — nothing is copied from the catalogue
 * (ADR-0001). The other, which is the point of the ticket, is that the checks
 * are **blocking**: an empty hint tier breaks the game after four tries already
 * spent, so the refusal happens here, while a human is looking.
 */

const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999'

/** Three footballers the fixture leaves fully schedulable. */
const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

const grid = (over: Partial<Parameters<typeof scheduleGrid>[0]> = {}) => ({
  date: '2026-09-09',
  theme: 'standard',
  footballerIds: SCHEDULABLE,
  ...over,
})

/**
 * One day read back, through the month.
 *
 * There is no read for a single date: the month carries every day's grid and
 * the holes between them, which is what the screen needs and what the window
 * over a day reads from. Asserting through it is therefore asserting on the
 * only path the application has.
 */
const gridOn = async (date: string) => {
  const calendar = await getMonthCalendar(date.slice(0, 7))
  return calendar.days.find((day) => day.date === date)?.grid ?? null
}

beforeEach(async () => {
  await seedCatalogue(db)
})

describe('getMonthCalendar', () => {
  it('shows every day of the month, and a day with no grid is a hole', async () => {
    const calendar = await getMonthCalendar('2026-09')

    expect(calendar.month).toBe('2026-09')
    expect(calendar.days).toHaveLength(30)
    // The absence of a row *is* the hole: there is nothing else to read.
    expect(calendar.days.every((day) => day.grid === null)).toBe(true)
  })

  it('carries the theme and the three enigmas of a programmed day', async () => {
    await scheduleGrid(grid({ theme: 'rétro' }))

    const calendar = await getMonthCalendar('2026-09')
    const day = calendar.days.find((d) => d.date === '2026-09-09')

    expect(day?.grid?.theme).toBe('rétro')
    expect(day?.grid?.enigmas).toEqual([
      { position: 1, footballerId: FOOTBALLER_IDS.complete, name: 'Zinedine Zidane' },
      { position: 2, footballerId: FOOTBALLER_IDS.untypedReserve, name: 'Íñigo Sarasola' },
      { position: 3, footballerId: FOOTBALLER_IDS.loan, name: 'Théo Balland' },
    ])
  })

  it('leaves the neighbouring months alone', async () => {
    await scheduleGrid(grid({ date: '2026-09-01' }))

    const august = await getMonthCalendar('2026-08')

    expect(august.days).toHaveLength(31)
    expect(august.days.every((day) => day.grid === null)).toBe(true)
  })

  it('reads the name from the catalogue rather than from the grid', async () => {
    // An enigma designates a footballer and copies nothing: correcting him in
    // the catalogue corrects every grid he appears in, archives included
    // (ADR-0001). There is no snapshot to invalidate because there is none.
    await scheduleGrid(grid())
    await db
      .update(footballers)
      .set({ name: 'Zinédine Zidane' })
      .where(eq(footballers.id, FOOTBALLER_IDS.complete))

    const day = (await getMonthCalendar('2026-09')).days.find((d) => d.date === '2026-09-09')

    expect(day?.grid?.enigmas[0]?.name).toBe('Zinédine Zidane')
  })
})

describe('scheduleGrid', () => {
  it('programmes a date with its theme and its three footballers', async () => {
    const scheduled = await scheduleGrid(grid({ theme: 'mercato' }))

    expect(scheduled).toMatchObject({ date: '2026-09-09', theme: 'mercato' })
    expect(scheduled.enigmas.map((e) => e.position)).toEqual([1, 2, 3])
  })

  it('keeps one grid per date: programming the same day again replaces it', async () => {
    await scheduleGrid(grid({ theme: 'standard' }))
    await scheduleGrid(
      grid({
        theme: 'hors-série',
        footballerIds: [
          FOOTBALLER_IDS.loan,
          FOOTBALLER_IDS.complete,
          FOOTBALLER_IDS.untypedReserve,
        ],
      }),
    )

    const grids = await db.select().from(dailyChallenges)
    const items = await db.select().from(challengeItems)

    expect(grids).toHaveLength(1)
    expect(items).toHaveLength(3)

    const reread = await gridOn('2026-09-09')
    expect(reread?.theme).toBe('hors-série')
    expect(reread?.enigmas[0]?.footballerId).toBe(FOOTBALLER_IDS.loan)
  })

  it('accepts any theme on any day, with no automatic check attached to it', async () => {
    // Specs §4: no theme belongs to a day of the week, and nothing verifies
    // that the three careers match what the theme announces. The admin answers
    // for that, and this is the assertion that says so.
    const friday = await scheduleGrid(grid({ date: '2026-09-11', theme: 'rétro' }))

    expect(friday.theme).toBe('rétro')
  })
})

describe('scheduleGrid refuses', () => {
  /** The report of a refusal, or a failure saying the grid went through. */
  async function refusalOf(input: Parameters<typeof scheduleGrid>[0]) {
    try {
      await scheduleGrid(input)
    } catch (error) {
      if (error instanceof NotSchedulableError) return error
      throw error
    }
    throw new Error('The grid was scheduled when it should have been refused.')
  }

  it('a footballer whose passage has no matches or no goals', async () => {
    const refusal = await refusalOf(
      grid({
        footballerIds: [
          FOOTBALLER_IDS.duplicatePassage,
          FOOTBALLER_IDS.complete,
          FOOTBALLER_IDS.loan,
        ],
      }),
    )

    expect(refusal.message).toContain('Yannick Perreau')
    expect(refusal.message).toContain('matchs ou buts manquants (Stade rennais)')
  })

  it('a footballer with no nationality', async () => {
    const refusal = await refusalOf(
      grid({
        footballerIds: [
          FOOTBALLER_IDS.complete,
          FOOTBALLER_IDS.incomplete,
          FOOTBALLER_IDS.loan,
        ],
      }),
    )

    expect(refusal.message).toContain('Lucien Farge : nationalité manquante')
  })

  it('more goals than matches', async () => {
    await db
      .update(playerClubs)
      .set({ goals: 999 })
      .where(eq(playerClubs.id, PASSAGE_IDS.completeCannes))

    const refusal = await refusalOf(grid())

    expect(refusal.message).toContain('plus de buts que de matchs (AS Cannes)')
  })

  it('a passage that ends before it begins', async () => {
    await db
      .update(playerClubs)
      .set({ endYear: 1980 })
      .where(eq(playerClubs.id, PASSAGE_IDS.completeBordeaux))

    const refusal = await refusalOf(grid())

    expect(refusal.message).toContain('fin de passage avant son début (Girondins de Bordeaux)')
  })

  it('a passage starting before 1880', async () => {
    await db
      .update(playerClubs)
      .set({ startYear: 1875, endYear: 1879 })
      .where(eq(playerClubs.id, PASSAGE_IDS.completeCannes))

    const refusal = await refusalOf(grid())

    expect(refusal.message).toContain('début avant 1880 (AS Cannes)')
  })

  it('and says so footballer by footballer, in one message', async () => {
    const refusal = await refusalOf(
      grid({
        footballerIds: [
          FOOTBALLER_IDS.incomplete,
          FOOTBALLER_IDS.duplicatePassage,
          FOOTBALLER_IDS.complete,
        ],
      }),
    )

    expect(refusal.blocked.map((f) => f.name)).toEqual(['Lucien Farge', 'Yannick Perreau'])
    expect(refusal.message).toContain('Lucien Farge')
    expect(refusal.message).toContain('Yannick Perreau')
  })

  it('and writes nothing at all: a refused day stays a hole', async () => {
    await refusalOf(
      grid({
        footballerIds: [
          FOOTBALLER_IDS.incomplete,
          FOOTBALLER_IDS.complete,
          FOOTBALLER_IDS.loan,
        ],
      }),
    )

    expect(await gridOn('2026-09-09')).toBeNull()
  })

  it('and does not damage the grid already programmed on that date', async () => {
    await scheduleGrid(grid({ theme: 'standard' }))

    await refusalOf(
      grid({
        theme: 'rétro',
        footballerIds: [
          FOOTBALLER_IDS.incomplete,
          FOOTBALLER_IDS.complete,
          FOOTBALLER_IDS.loan,
        ],
      }),
    )

    const kept = await gridOn('2026-09-09')
    expect(kept?.theme).toBe('standard')
    expect(kept?.enigmas).toHaveLength(3)
  })

  it('a footballer who is not in the referential at all', async () => {
    await expect(
      scheduleGrid(
        grid({ footballerIds: [UNKNOWN_ID, FOOTBALLER_IDS.complete, FOOTBALLER_IDS.loan] }),
      ),
    ).rejects.toBeInstanceOf(FootballerNotFoundError)
  })
})

describe('listThemes', () => {
  it('is empty before anything is programmed', async () => {
    expect(await listThemes()).toEqual([])
  })

  it('offers what has already been used, once each, in order', async () => {
    await scheduleGrid(grid({ date: '2026-09-09', theme: 'rétro' }))
    await scheduleGrid(grid({ date: '2026-09-10', theme: 'standard' }))
    await scheduleGrid(grid({ date: '2026-09-11', theme: 'rétro' }))

    expect(await listThemes()).toEqual(['rétro', 'standard'])
  })
})

describe('getSchedulingScreen', () => {
  it('shows the month of today, and opens on no day at all', async () => {
    // The common arrival: `/admin/schedule` with an empty query string. The
    // calendar is there, and nothing is open on top of it.
    const screen = await getSchedulingScreen({})

    expect(screen.calendar.month).toBe(screen.today.slice(0, 7))
    expect(screen.openDate).toBeNull()
  })

  it('opens on the day a link names, in the month that contains it', async () => {
    await scheduleGrid(grid())

    const screen = await getSchedulingScreen({ date: '2026-09-09' })

    expect(screen.calendar.month).toBe('2026-09')
    expect(screen.openDate).toBe('2026-09-09')
    // The day's grid rides in the calendar: the window needs no read of its own.
    const day = screen.calendar.days.find((d) => d.date === '2026-09-09')
    expect(day?.grid?.enigmas.map((e) => e.position)).toEqual([1, 2, 3])
  })

  it('opens on a day with no grid: the hole is what the admin came to fill', async () => {
    const screen = await getSchedulingScreen({ date: '2026-09-09' })

    expect(screen.openDate).toBe('2026-09-09')
    expect(screen.calendar.days.find((d) => d.date === '2026-09-09')?.grid).toBeNull()
  })

  it('opens on nothing when the date is a typo, rather than on today', async () => {
    // `?date=` comes from a query string. A fallback that opened a window on
    // today would put the admin in front of a form he did not ask for.
    for (const date of ['demain', '2026-09', '2026-02-30']) {
      expect((await getSchedulingScreen({ date })).openDate).toBeNull()
    }
  })

  it('opens on nothing when the day is not in the month on screen', async () => {
    // The window reads the day's grid from the calendar above it, so a day
    // outside it has nothing to show.
    const screen = await getSchedulingScreen({ month: '2026-10', date: '2026-09-09' })

    expect(screen.calendar.month).toBe('2026-10')
    expect(screen.openDate).toBeNull()
  })

  it('pages to the neighbouring months', async () => {
    const screen = await getSchedulingScreen({ month: '2026-01' })

    expect(screen.previousMonth).toBe('2025-12')
    expect(screen.nextMonth).toBe('2026-02')
  })
})
