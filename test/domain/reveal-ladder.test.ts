import { describe, expect, it } from 'vitest'

import {
  errorsMade,
  isExhausted,
  revealedHints,
  revealedTiers,
} from '@/server/domain/reveal-ladder'
import type { FootballerCareer, PlayerClub } from '@/shared/career'
import type { PlayStatus } from '@/shared/play'

/**
 * L'échelle de dévoilement — the rule the whole ticket is built around, and the
 * one place it is cheap to assert exhaustively.
 *
 * Three properties live here and nowhere else:
 *
 * - **The order of the tiers is the specs' table** (§3): décennie, durée par
 *   club, nationalité, matchs en championnat, buts en championnat. It is not
 *   derived from anything and it must not drift.
 * - **One erreur reveals exactly one tier.** Which is why the ladder is a
 *   function of the erreurs made rather than something a service increments:
 *   the number of hints cannot get out of step with the number of essais spent
 *   if nothing anywhere stores it.
 * - **Six essais, and the sixth erreur reveals no sixth hint.** There are five
 *   tiers for six essais on purpose — the last erreur gives the answer.
 *
 * The career is the catalogue's and carries the name of the footballer. That is
 * deliberate: the ladder is handed the answer on every call and its job is to
 * never put it in what it returns.
 */
const club = (over: Partial<PlayerClub> = {}): PlayerClub => ({
  id: 'p1',
  clubId: 'c1',
  clubName: 'AS Cannes',
  isLoan: false,
  startYear: 1988,
  endYear: 1992,
  matches: 61,
  goals: 6,
  ...over,
})

const career = (over: Partial<FootballerCareer> = {}): FootballerCareer => ({
  footballerId: 'f1',
  name: 'Zinedine Zidane',
  wikiFrUrl: null,
  wikiEnUrl: null,
  nationality: { id: 'n1', code: 'FR', frName: 'France', flagKey: 'abc' },
  playerClubs: [club()],
  ...over,
})

/** The hints a partie with `errors` erreurs has earned, on a fixed career. */
const hints = (errors: number, over: Partial<FootballerCareer> = {}) =>
  revealedHints({ errors, career: career(over), currentYear: 2026 })

describe('revealedTiers', () => {
  it('reveals nothing before the first erreur', () => {
    expect(revealedTiers(0)).toEqual([])
  })

  it('reveals exactly one more tier per erreur, in the specs’ order', () => {
    expect(revealedTiers(1)).toEqual([1])
    expect(revealedTiers(2)).toEqual([1, 2])
    expect(revealedTiers(3)).toEqual([1, 2, 3])
    expect(revealedTiers(4)).toEqual([1, 2, 3, 4])
    expect(revealedTiers(5)).toEqual([1, 2, 3, 4, 5])
  })

  it('has no sixth tier to give on the sixth erreur', () => {
    // Five tiers for six essais: the last erreur reveals the answer instead.
    expect(revealedTiers(6)).toEqual([1, 2, 3, 4, 5])
  })

  it('stops at five however many erreurs are claimed', () => {
    expect(revealedTiers(99)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('errorsMade', () => {
  const play = (triesUsed: number, status: PlayStatus) => ({ triesUsed, status })

  it('counts every essai of a partie still being played', () => {
    // A doublon and a tour passé are erreurs here: they consume an essai and
    // reveal a hint, exactly like a wrong footballer (specs §3).
    expect(errorsMade(play(3, 'in_progress'))).toBe(3)
  })

  it('does not count the winning essai', () => {
    // Found on the second essai means one erreur, therefore one hint. Counting
    // the correct essai would reveal a tier for getting it right.
    expect(errorsMade(play(2, 'solved'))).toBe(1)
  })

  it('counts every essai of a lost partie', () => {
    expect(errorsMade(play(6, 'failed'))).toBe(6)
  })

  it('counts nothing on a partie the day took away without an essai', () => {
    // Read as failed by the clock (`server/domain/play.ts`) with nothing spent.
    expect(errorsMade(play(0, 'failed'))).toBe(0)
  })
})

describe('isExhausted', () => {
  it('leaves the six essais playable', () => {
    expect(isExhausted(0)).toBe(false)
    expect(isExhausted(5)).toBe(false)
  })

  it('is reached once the sixth essai is spent', () => {
    // Which is what refuses the seventh, server-side.
    expect(isExhausted(6)).toBe(true)
    expect(isExhausted(7)).toBe(true)
  })
})

describe('the hints themselves', () => {
  it('gives nothing at all before the first erreur', () => {
    expect(hints(0)).toEqual([])
  })

  it('gives the decade of the start of the career, rounded down', () => {
    expect(hints(1)).toEqual([{ tier: 1, decade: 1980 }])
  })

  it('reads the decade off the earliest passage, whatever order they come in', () => {
    const passages = [
      club({ id: 'p2', startYear: 2001, endYear: 2006 }),
      club({ id: 'p1', startYear: 1994, endYear: 2001 }),
    ]
    expect(hints(1, { playerClubs: passages })).toEqual([{ tier: 1, decade: 1990 }])
  })

  it('gives the duration of each passage in seasons, in career order', () => {
    // `end_year - start_year + 1` (CONTEXT.md): 2015-2015 is one season,
    // 2015-2016 is two. An approximation, and an assumed one.
    const passages = [
      club({ id: 'p2', clubName: 'Juventus', startYear: 1996, endYear: 2001 }),
      club({ id: 'p1', clubName: 'AS Cannes', startYear: 1988, endYear: 1988 }),
    ]

    expect(hints(2, { playerClubs: passages })[1]).toEqual({
      tier: 2,
      durations: [
        { clubName: 'AS Cannes', figure: 1 },
        { clubName: 'Juventus', figure: 6 },
      ],
    })
  })

  it('counts an unfinished passage up to the current season', () => {
    // « Null = career in progress. The displayed duration then keeps growing »
    // (`server/db/schema.ts`). The year is handed in rather than read from a
    // clock: this layer has none.
    const passages = [club({ startYear: 2020, endYear: null })]
    expect(hints(2, { playerClubs: passages })[1]).toEqual({
      tier: 2,
      durations: [{ clubName: 'AS Cannes', figure: 7 }],
    })
  })

  it('never gives a passage fewer than one season', () => {
    // `end_year >= start_year` is a scheduling predicate and not a guarantee in
    // time: an import may write a negative span under an enigma already
    // published, and "-2 saisons" on screen is worse than an approximation.
    const passages = [club({ startYear: 2015, endYear: 2012 })]
    expect(hints(2, { playerClubs: passages })[1]).toEqual({
      tier: 2,
      durations: [{ clubName: 'AS Cannes', figure: 1 }],
    })
  })

  it('gives the nationality with its flag, and never its identifier', () => {
    expect(hints(3)[2]).toEqual({
      tier: 3,
      nationality: { frName: 'France', flagKey: 'abc' },
    })
  })

  it('says a nationality is missing rather than pretending it is there', () => {
    // An admin cannot schedule such a footballer (`shared/schedule.ts`), but
    // nothing stops an import from emptying the column afterwards. A blank
    // third tier is a game broken after three essais already spent.
    expect(hints(3, { nationality: null })[2]).toEqual({ tier: 3, nationality: null })
  })

  it('gives the league matches of each passage, in career order', () => {
    const passages = [
      club({ id: 'p2', clubName: 'Juventus', startYear: 1996, matches: 151, goals: 24 }),
      club({ id: 'p1', clubName: 'AS Cannes', startYear: 1988, matches: 61, goals: 6 }),
    ]

    expect(hints(4, { playerClubs: passages })[3]).toEqual({
      tier: 4,
      matches: [
        { clubName: 'AS Cannes', figure: 61 },
        { clubName: 'Juventus', figure: 151 },
      ],
    })
  })

  it('gives the league goals last', () => {
    expect(hints(5)[4]).toEqual({ tier: 5, goals: [{ clubName: 'AS Cannes', figure: 6 }] })
  })

  it('passes a figure the catalogue does not have through as missing', () => {
    const passages = [club({ matches: null, goals: null })]
    const revealed = hints(5, { playerClubs: passages })

    expect(revealed[3]).toEqual({ tier: 4, matches: [{ clubName: 'AS Cannes', figure: null }] })
    expect(revealed[4]).toEqual({ tier: 5, goals: [{ clubName: 'AS Cannes', figure: null }] })
  })

  it('gives the tiers in the specs’ order and nothing beyond what was paid for', () => {
    expect(hints(3).map((hint) => hint.tier)).toEqual([1, 2, 3])
  })

  it('stops at the five tiers when every essai has been spent', () => {
    expect(hints(6).map((hint) => hint.tier)).toEqual([1, 2, 3, 4, 5])
  })

  it('never carries the name of the footballer, at any tier', () => {
    // The constraint the ticket exists for: the answer never leaves the server
    // before the end (specs §10.1). The ladder is handed it on every call.
    expect(JSON.stringify(hints(6))).not.toContain('Zidane')
  })

  it('carries no year of a career, so the decade stays the only date given', () => {
    // Tier 2 gives a *count* of seasons and never the years themselves: the
    // exact years would hand over tier 1 and a great deal more besides.
    expect(JSON.stringify(hints(6))).not.toContain('1988')
  })

  it('shows a parcours with no passage at all as empty tiers', () => {
    // Not schedulable (`no-career`), and reachable anyway: an import that
    // replaces a parcours can empty one under a grid already published.
    const revealed = hints(6, { playerClubs: [] })

    expect(revealed[0]).toEqual({ tier: 1, decade: null })
    expect(revealed[1]).toEqual({ tier: 2, durations: [] })
  })
})
