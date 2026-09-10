import { describe, expect, it } from 'vitest'

import { enigmaPassages } from '@/server/domain/enigma'
import type { EnigmaPassageRow } from '@/server/domain/enigma'

/**
 * L'énigme telle qu'elle est posée, as a pure rule.
 *
 * Two claims are being made here and only the first one is about order. The
 * parcours *is* the enigma and it is shown whole from the start (specs §3), so
 * the clubs come out in career order, a loan carries its annotation, and a club
 * crossed twice appears twice. The second claim is the one the ticket calls
 * central: this projection is where everything else — the years, the matches,
 * the goals — is dropped, so nothing that a hint tier reveals can reach the
 * page. A cached HTML that cannot contain a hint is stronger than one that
 * happens not to.
 */

const passage = (over: Partial<EnigmaPassageRow> = {}): EnigmaPassageRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  clubName: 'AS Cannes',
  isLoan: false,
  startYear: 1988,
  endYear: 1992,
  ...over,
})

describe('enigmaPassages', () => {
  it('puts the clubs in chronological order, whatever order they were read in', () => {
    const posed = enigmaPassages([
      passage({ id: 'b', clubName: 'Juventus', startYear: 1996, endYear: 2001 }),
      passage({ id: 'a', clubName: 'AS Cannes', startYear: 1988, endYear: 1992 }),
      passage({ id: 'c', clubName: 'Real Madrid', startYear: 2001, endYear: 2006 }),
    ])

    expect(posed.map((p) => p.clubName)).toEqual(['AS Cannes', 'Juventus', 'Real Madrid'])
  })

  it('carries the loan annotation', () => {
    const posed = enigmaPassages([passage({ clubName: 'Stade de Reims', isLoan: true })])

    expect(posed).toEqual([{ clubName: 'Stade de Reims', isLoan: true }])
  })

  it('shows a club crossed twice twice, each at its place in the chronology', () => {
    const posed = enigmaPassages([
      passage({ id: 'a', clubName: 'FC Nantes', startYear: 2009, endYear: 2013 }),
      passage({ id: 'b', clubName: 'Juventus', startYear: 2013, endYear: 2016 }),
      passage({ id: 'c', clubName: 'FC Nantes', startYear: 2016, endYear: 2019 }),
    ])

    expect(posed.map((p) => p.clubName)).toEqual(['FC Nantes', 'Juventus', 'FC Nantes'])
  })

  it('orders a loan starting the same year as its parent contract by its end', () => {
    // The fixture's awkward case, and the reason `id` is in the sort key: two
    // passages beginning the same year must not swap between two page loads,
    // because the sequence of clubs is the enigma.
    const posed = enigmaPassages([
      passage({ id: 'a', clubName: 'Olympique lyonnais', startYear: 2015, endYear: 2019 }),
      passage({ id: 'b', clubName: 'Stade de Reims', isLoan: true, startYear: 2015, endYear: 2016 }),
    ])

    expect(posed).toEqual([
      { clubName: 'Stade de Reims', isLoan: true },
      { clubName: 'Olympique lyonnais', isLoan: false },
    ])
  })

  it('sorts a spell still in progress last among those starting the same year', () => {
    const posed = enigmaPassages([
      passage({ id: 'a', clubName: 'Levante UD', startYear: 2020, endYear: null }),
      passage({ id: 'b', clubName: 'FC Barcelone C', startYear: 2020, endYear: 2022 }),
    ])

    expect(posed.map((p) => p.clubName)).toEqual(['FC Barcelone C', 'Levante UD'])
  })

  it('gives back the club and the loan flag, and nothing else', () => {
    // Asserted on the keys rather than on the values: this is the barrier that
    // keeps a hint out of a page cached full and shared by everyone, and a
    // field riding along on a row would slip past an equality on two clubs.
    const [posed] = enigmaPassages([passage({ startYear: 1988, endYear: 1992 })])

    expect(Object.keys(posed ?? {})).toEqual(['clubName', 'isLoan'])
  })

  it('gives back nothing for a footballer with no passage', () => {
    // Unschedulable, so it cannot happen through the programming screen — but
    // the projection has no reason to be the layer that refuses it.
    expect(enigmaPassages([])).toEqual([])
  })
})
