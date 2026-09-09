import { describe, expect, it } from 'vitest'

import { comparePlayerClubs, sortPlayerClubs } from '@/server/domain/career'
import type { PlayerClub } from '@/shared/career'

/** A passage with only the fields the ordering rule looks at. */
function passage(partial: Partial<PlayerClub> & Pick<PlayerClub, 'id'>): PlayerClub {
  return {
    clubId: `club-${partial.id}`,
    clubName: `Club ${partial.id}`,
    isLoan: false,
    startYear: 2000,
    endYear: 2001,
    matches: null,
    goals: null,
    ...partial,
  }
}

const ids = (list: PlayerClub[]) => list.map((p) => p.id)

describe('comparePlayerClubs', () => {
  it('orders by start year first', () => {
    const sorted = sortPlayerClubs([
      passage({ id: 'c', startYear: 2010, endYear: 2012 }),
      passage({ id: 'a', startYear: 1996, endYear: 2000 }),
      passage({ id: 'b', startYear: 2000, endYear: 2010 }),
    ])
    expect(ids(sorted)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a tie on start year by end year, shortest spell first', () => {
    // The typical case: a loan starting the same year as the parent contract.
    const sorted = sortPlayerClubs([
      passage({ id: 'contract', startYear: 2015, endYear: 2019 }),
      passage({ id: 'loan', startYear: 2015, endYear: 2016, isLoan: true }),
    ])
    expect(ids(sorted)).toEqual(['loan', 'contract'])
  })

  it('puts a career still in progress last among spells starting the same year', () => {
    const sorted = sortPlayerClubs([
      passage({ id: 'ongoing', startYear: 2015, endYear: null }),
      passage({ id: 'ended', startYear: 2015, endYear: 2016 }),
    ])
    expect(ids(sorted)).toEqual(['ended', 'ongoing'])
  })

  it('is deterministic when start year and end year are both equal', () => {
    // The order of the clubs is part of the enigma: two identical spells must
    // not swap between two page loads. `id` is the final tie-breaker.
    const a = passage({ id: '00000000-0000-4000-8000-00000000000a' })
    const b = passage({ id: '00000000-0000-4000-8000-00000000000b' })

    expect(ids(sortPlayerClubs([a, b]))).toEqual(ids(sortPlayerClubs([b, a])))
    expect(ids(sortPlayerClubs([b, a]))).toEqual([a.id, b.id])
  })

  it('does not mutate its input', () => {
    const input = [passage({ id: 'b', startYear: 2010 }), passage({ id: 'a', startYear: 2000 })]
    sortPlayerClubs(input)
    expect(ids(input)).toEqual(['b', 'a'])
  })

  it('returns 0 for a passage compared with itself', () => {
    const only = passage({ id: 'a' })
    expect(comparePlayerClubs(only, only)).toBe(0)
  })

  it('handles the empty career', () => {
    expect(sortPlayerClubs([])).toEqual([])
  })
})
