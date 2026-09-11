import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { clubCrests, clubs, dailyChallenges, footballers, playerClubs } from '@/server/db/schema'
import { getDailyGrid, getGridOfDate } from '@/server/services/grid.service'
import { scheduleGrid } from '@/server/services/schedule.service'

import { db } from '@test/setup/db'
import { CLUB_IDS, FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { ONE_PIXEL_PNG, OTHER_PNG } from '@test/fixtures/crest'

/**
 * La grille du jour, read the way the player's page reads it, against a real
 * Postgres.
 *
 * Two things are being tested and they are not the same. One is the énoncé: the
 * three enigmas are all there from the start, each showing its parcours whole,
 * in career order, loans annotated — and the theme of the day announced. The
 * other is the decision the ticket calls central: this page is rendered once a
 * day and served to everyone from a shared cache, so what it must **not**
 * contain is as much the subject as what it contains. No name, no identifier,
 * no year, no figure, no personal state.
 */

/**
 * Two content addresses, written out rather than hashed here: the key is the
 * SHA-256 of the bytes for whatever *writes* a crest (ADR-0010), and this file
 * writes none — it puts a row in front of the reader and checks it comes back.
 */
const CREST_KEY = 'a'.repeat(64)
const OTHER_CREST_KEY = 'b'.repeat(64)

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
 * Every name and every identifier the answer could be spelled with, read from
 * the catalogue rather than copied out of the fixture: a footballer renamed in
 * `test/fixtures/catalogue.ts` would otherwise silently narrow the strongest
 * assertion in this file, and every profile is covered rather than the three
 * that happen to be scheduled.
 */
async function answers(): Promise<string[]> {
  const rows = await db.select({ id: footballers.id, name: footballers.name }).from(footballers)

  return rows.flatMap((row) => [row.id, row.name])
}

beforeEach(async () => {
  await seedCatalogue(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getGridOfDate', () => {
  it('is null on a date with no grid — the absence of a row is the hole', async () => {
    expect(await getGridOfDate('2026-09-09')).toBeNull()
  })

  it('announces the theme of the day', async () => {
    await scheduleGrid(grid({ theme: 'rétro' }))

    expect((await getGridOfDate('2026-09-09'))?.theme).toBe('rétro')
  })

  it('gives the three enigmas at once, in position order', async () => {
    await scheduleGrid(grid())

    const today = await getGridOfDate('2026-09-09')

    // All three, from the first read: blocking on the first must not cost the
    // rest of the day (specs §2). There is no sequential unlock to test for,
    // because there is nothing that could perform one.
    expect(today?.enigmas.map((enigma) => enigma.position)).toEqual([1, 2, 3])
  })

  it('shows each parcours whole, in chronological order and nothing else', async () => {
    await scheduleGrid(grid())

    const today = await getGridOfDate('2026-09-09')

    expect(today?.enigmas[0]?.passages).toEqual([
      { clubName: 'AS Cannes', isLoan: false, crestKey: null },
      { clubName: 'Girondins de Bordeaux', isLoan: false, crestKey: null },
      { clubName: 'Juventus', isLoan: false, crestKey: null },
      { clubName: 'Real Madrid', isLoan: false, crestKey: null },
    ])
  })

  it('annotates a loan, at its place in the chronology', async () => {
    await scheduleGrid(grid())

    const today = await getGridOfDate('2026-09-09')

    // Both passages start in 2015; the loan is the shorter one and comes first.
    expect(today?.enigmas[2]?.passages).toEqual([
      { clubName: 'Stade de Reims', isLoan: true, crestKey: null },
      { clubName: 'Olympique lyonnais', isLoan: false, crestKey: null },
    ])
  })

  it('shows a club crossed twice twice, each at its place in the chronology', async () => {
    // The fixture's duplicate profile, rewritten as a genuine return spell —
    // Rennes, then Nantes, then Rennes again. Two rows for one club are
    // indistinguishable from a real double passage once they are in the
    // catalogue (`docs/research/wikidata-coverage.md`), which is exactly why
    // the display must place them and never collapse them.
    const footballerId = FOOTBALLER_IDS.duplicatePassage
    await db.delete(playerClubs).where(eq(playerClubs.footballerId, footballerId))
    await db.insert(playerClubs).values([
      { footballerId, clubId: CLUB_IDS.rennes, isLoan: false, startYear: 2012, endYear: 2015, matches: 68, goals: 4 },
      { footballerId, clubId: CLUB_IDS.nantes, isLoan: false, startYear: 2015, endYear: 2018, matches: 71, goals: 9 },
      { footballerId, clubId: CLUB_IDS.rennes, isLoan: false, startYear: 2018, endYear: 2021, matches: 54, goals: 6 },
    ])
    await scheduleGrid(
      grid({ footballerIds: [footballerId, FOOTBALLER_IDS.complete, FOOTBALLER_IDS.loan] }),
    )

    const today = await getGridOfDate('2026-09-09')

    expect(today?.enigmas[0]?.passages.map((passage) => passage.clubName)).toEqual([
      'Stade rennais',
      'FC Nantes',
      'Stade rennais',
    ])
  })

  it('carries the crest of a club that has one, and null for a club that has not', async () => {
    // The crest travels with the parcours because it is the same public fact as
    // the club's name: the parcours is shown whole from the first second, so an
    // image of a club already named reveals nothing. Bordeaux gets one, the
    // rest of Zidane's clubs keep none — the normal state of a freshly imported
    // catalogue, and the gap the page has to draw.
    await db
      .insert(clubCrests)
      .values({ key: CREST_KEY, bytes: ONE_PIXEL_PNG, contentType: 'image/png', byteSize: ONE_PIXEL_PNG.byteLength })
    await db.update(clubs).set({ crestKey: CREST_KEY }).where(eq(clubs.id, CLUB_IDS.bordeaux))
    await scheduleGrid(grid())

    const today = await getGridOfDate('2026-09-09')

    expect(today?.enigmas[0]?.passages.map((passage) => passage.crestKey)).toEqual([
      null,
      CREST_KEY,
      null,
      null,
    ])
  })

  it('reads the crest on every read, so replacing one replaces it in the grid', async () => {
    // Same reason as the club's name: an enigma designates a footballer and
    // copies nothing from him (ADR-0001). The address is the content, so a new
    // crest is a new URL and there is nothing to invalidate but the page cache.
    await db.insert(clubCrests).values([
      { key: CREST_KEY, bytes: ONE_PIXEL_PNG, contentType: 'image/png', byteSize: ONE_PIXEL_PNG.byteLength },
      { key: OTHER_CREST_KEY, bytes: OTHER_PNG, contentType: 'image/png', byteSize: OTHER_PNG.byteLength },
    ])
    await db.update(clubs).set({ crestKey: CREST_KEY }).where(eq(clubs.id, CLUB_IDS.bordeaux))
    await scheduleGrid(grid())

    await db.update(clubs).set({ crestKey: OTHER_CREST_KEY }).where(eq(clubs.id, CLUB_IDS.bordeaux))

    const today = await getGridOfDate('2026-09-09')

    expect(today?.enigmas[0]?.passages[1]?.crestKey).toBe(OTHER_CREST_KEY)
  })

  it('carries no answer and no identifier at all', async () => {
    await scheduleGrid(grid())

    const served = JSON.stringify(await getGridOfDate('2026-09-09'))

    // Asserted on the whole serialised value rather than on the fields we
    // remembered to look at: this is what will be in the HTML of a page cached
    // full and shared by every visitor.
    const forbidden = await answers()
    expect(forbidden.length).toBeGreaterThan(0)
    for (const answer of forbidden) {
      expect(served).not.toContain(answer)
    }
  })

  it('carries no hint: not a year, not a match, not a goal', async () => {
    await scheduleGrid(grid())

    const served = JSON.stringify(await getGridOfDate('2026-09-09'))

    // Zidane's Bordeaux passage: 1992-1996, 139 matches, 28 goals. Hint tiers
    // 1, 2, 4 and 5 are read at the moment they are revealed, over a request
    // that carries a player's identity — never from this one.
    for (const figure of ['1992', '1996', '139', '28']) {
      expect(served).not.toContain(figure)
    }
  })

  it('reads the parcours on every read, so correcting a club corrects the grid', async () => {
    // An enigma designates a footballer and copies nothing from him (ADR-0001):
    // there is no snapshot to invalidate, only a page cache that turns over.
    await scheduleGrid(grid())
    await db
      .update(clubs)
      .set({ frName: 'FC Girondins de Bordeaux' })
      .where(eq(clubs.id, CLUB_IDS.bordeaux))

    const today = await getGridOfDate('2026-09-09')

    expect(today?.enigmas[0]?.passages[1]?.clubName).toBe('FC Girondins de Bordeaux')
  })

  it('is a grid with no enigma, not a hole, when the enigmas are missing', async () => {
    // A `daily_challenges` row with no items is a state the database allows and
    // this application never writes. A hole and a half-written grid are
    // different accidents, and reading them as the same one would send whoever
    // is looking into the wrong place.
    await db
      .insert(dailyChallenges)
      .values({ date: '2026-09-09', theme: 'hors-série', status: 'scheduled' })

    const today = await getGridOfDate('2026-09-09')

    expect(today).toEqual({ date: '2026-09-09', theme: 'hors-série', enigmas: [] })
  })
})

describe('getDailyGrid', () => {
  it('reads the grid of today in Paris', async () => {
    await scheduleGrid(grid({ date: '2026-09-09', theme: 'rétro' }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-09T11:00:00Z'))

    expect((await getDailyGrid())?.date).toBe('2026-09-09')
  })

  it('turns the grid at Paris midnight, not at UTC midnight', async () => {
    await scheduleGrid(grid({ date: '2026-09-09', theme: 'rétro' }))
    await scheduleGrid(grid({ date: '2026-09-10', theme: 'mercato' }))
    // Only `Date` is faked: the driver's own timers have to keep running.
    vi.useFakeTimers({ toFake: ['Date'] })

    // 21:59 UTC is 23:59 in Paris in September: still yesterday's grid.
    vi.setSystemTime(new Date('2026-09-09T21:59:00Z'))
    expect((await getDailyGrid())?.theme).toBe('rétro')

    // One minute later Paris has turned the page, and UTC has not.
    vi.setSystemTime(new Date('2026-09-09T22:00:00Z'))
    expect((await getDailyGrid())?.theme).toBe('mercato')
  })

  it('is null on a day nobody programmed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-09T11:00:00Z'))

    expect(await getDailyGrid()).toBeNull()
  })
})
