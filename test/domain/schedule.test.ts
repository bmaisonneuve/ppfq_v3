import { describe, expect, it } from 'vitest'

import { assessSchedulability } from '@/server/domain/schedule'
import type { FootballerCareer, PlayerClub } from '@/shared/career'
import { describeRefusal } from '@/shared/schedule'

/**
 * The blocking checks, as pure rules — the heart of #6.
 *
 * They exist because a hint tier reads a column at the moment it is revealed:
 * an empty one is a blank screen after four tries already spent, and the player
 * has no way back. So the refusal happens at scheduling, where a human is
 * looking, and it says what is missing rather than that something is.
 *
 * What it does **not** check is whether the parcours is true. That is not an
 * oversight (`docs/modele-donnees.md` §4): a career can be complete and false
 * by omission, no query detects it, and the only guard is the admin's eye.
 */

const nationality = { id: 'n1', code: 'FR', frName: 'France', flagKey: null }

const passage = (over: Partial<PlayerClub> = {}): PlayerClub => ({
  id: 'p1',
  clubId: 'c1',
  clubName: 'AS Cannes',
  crestKey: null,
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
  nationality,
  playerClubs: [passage()],
  ...over,
})

describe('a footballer who can be scheduled', () => {
  it('has nothing standing in the way', () => {
    expect(assessSchedulability(career())).toEqual({
      footballerId: 'f1',
      name: 'Zinedine Zidane',
      obstacles: [],
    })
  })

  it('may have a career still in progress', () => {
    // An open spell is not a hole: `end_year` null means the career is running,
    // and the displayed duration simply keeps growing.
    const open = career({ playerClubs: [passage({ endYear: null })] })

    expect(assessSchedulability(open).obstacles).toEqual([])
  })

  it('may have a passage with no goals scored, as long as the figure is there', () => {
    // Zero is a fact, null is a hole. Only the second empties a hint.
    const scoreless = career({ playerClubs: [passage({ goals: 0 })] })

    expect(assessSchedulability(scoreless).obstacles).toEqual([])
  })
})

describe('completeness — what would leave a hint tier empty', () => {
  it('refuses a footballer with no parcours at all', () => {
    const empty = career({ playerClubs: [] })

    expect(assessSchedulability(empty).obstacles).toEqual([
      { code: 'no-career', clubName: null },
    ])
  })

  it('refuses a missing nationality: hint 3 would be empty', () => {
    const stateless = career({ nationality: null })

    expect(assessSchedulability(stateless).obstacles).toEqual([
      { code: 'missing-nationality', clubName: null },
    ])
  })

  it('refuses a passage with no matches: hint 4 would be empty', () => {
    const partial = career({ playerClubs: [passage({ matches: null })] })

    expect(assessSchedulability(partial).obstacles).toEqual([
      { code: 'missing-figures', clubName: 'AS Cannes' },
    ])
  })

  it('refuses a passage with no goals: hint 5 would be empty', () => {
    const partial = career({ playerClubs: [passage({ goals: null })] })

    expect(assessSchedulability(partial).obstacles).toEqual([
      { code: 'missing-figures', clubName: 'AS Cannes' },
    ])
  })

  it('names the club that is missing them, not the footballer', () => {
    // Eight clubs and one refusal is a hunt; the club is what makes it a fix.
    const long = career({
      playerClubs: [
        passage({ id: 'a', clubName: 'AS Cannes' }),
        passage({ id: 'b', clubName: 'Juventus', matches: null, goals: null }),
      ],
    })

    expect(assessSchedulability(long).obstacles).toEqual([
      { code: 'missing-figures', clubName: 'Juventus' },
    ])
  })
})

describe('plausibility — the three predicates the source violates', () => {
  it('refuses more goals than matches', () => {
    const impossible = career({ playerClubs: [passage({ matches: 10, goals: 11 })] })

    expect(assessSchedulability(impossible).obstacles).toEqual([
      { code: 'goals-above-matches', clubName: 'AS Cannes' },
    ])
  })

  it('refuses a passage that ends before it begins', () => {
    const backwards = career({ playerClubs: [passage({ startYear: 1992, endYear: 1988 })] })

    expect(assessSchedulability(backwards).obstacles).toEqual([
      { code: 'end-before-start', clubName: 'AS Cannes' },
    ])
  })

  it('refuses a passage starting before organised football', () => {
    const ancient = career({ playerClubs: [passage({ startYear: 1875, endYear: 1879 })] })

    expect(assessSchedulability(ancient).obstacles).toEqual([
      { code: 'start-before-1880', clubName: 'AS Cannes' },
    ])
  })

  it('takes 1880 itself', () => {
    const earliest = career({ playerClubs: [passage({ startYear: 1880, endYear: 1884 })] })

    expect(assessSchedulability(earliest).obstacles).toEqual([])
  })
})

describe('the refusal message', () => {
  it('reports every obstacle at once, so the admin fixes them in one pass', () => {
    const broken = career({
      nationality: null,
      playerClubs: [passage({ matches: null, goals: 3 })],
    })

    expect(assessSchedulability(broken).obstacles).toEqual([
      { code: 'missing-nationality', clubName: null },
      { code: 'missing-figures', clubName: 'AS Cannes' },
    ])
  })

  it('reports the several faults of a single passage, each of them named', () => {
    const bad = career({
      playerClubs: [passage({ startYear: 1875, endYear: 1870, matches: 2, goals: 9 })],
    })

    expect(assessSchedulability(bad).obstacles.map((o) => o.code)).toEqual([
      'goals-above-matches',
      'end-before-start',
      'start-before-1880',
    ])
  })

  it('says what is missing, footballer by footballer', () => {
    const message = describeRefusal([
      { footballerId: 'f1', name: 'Zinedine Zidane', obstacles: [] },
      {
        footballerId: 'f2',
        name: 'Lucien Farge',
        obstacles: [
          { code: 'missing-nationality', clubName: null },
          { code: 'missing-figures', clubName: 'FC Nantes' },
        ],
      },
    ])

    expect(message).toBe(
      'Programmation refusée. Lucien Farge : nationalité manquante ; ' +
        'matchs ou buts manquants (FC Nantes).',
    )
  })

  it('is silent when every footballer is schedulable', () => {
    expect(describeRefusal([{ footballerId: 'f1', name: 'Zidane', obstacles: [] }])).toBeNull()
  })
})
