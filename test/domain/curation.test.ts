import { describe, expect, it } from 'vitest'

import { flagPassages, isLikelyReserveTeam, passagesOverlap } from '@/server/domain/curation'
import type { CuratedPassage } from '@/shared/curation'

/**
 * The two curation aids of `docs/stack-technique.md` §6, as pure rules.
 *
 * Both exist because the source cannot answer the question itself: reserve
 * teams are typed as ordinary senior clubs (measured: the three structural
 * signals cover 1,4–1,6 % of passages, and `FC Barcelona C` is typed as a plain
 * club), and years come from Wikidata raw and may overlap.
 */

const passage = (
  fields: Partial<CuratedPassage> & { id: string; startYear: number },
): CuratedPassage => ({
  clubId: `club-${fields.id}`,
  clubName: 'Un club',
  clubEnName: null,
  isLoan: false,
  endYear: null,
  matches: 10,
  goals: 1,
  ...fields,
})

describe('isLikelyReserveTeam', () => {
  it.each([
    ['FC Barcelone C', 'the measured counter-example: the source types it as a plain club'],
    ['FC Bayern Munich II', 'the roman numeral, the most common shape'],
    ['Real Sociedad B', 'the trailing letter'],
    ['Jong Ajax', 'the Dutch prefix'],
    ['Real Madrid Castilla', 'a reserve team with a name of its own'],
    ['FC Barcelona Atlètic', 'the other Barcelona reserve, Catalan spelling'],
    ['Bayern Munich Amateure', 'the German word'],
    ['Manchester United Reserves', 'the English word'],
    ['Chelsea U21', 'an age group'],
    ['Arsenal U-18', 'an age group, hyphenated'],
  ])('flags %s — %s', (clubName) => {
    expect(isLikelyReserveTeam(clubName)).toBe(true)
  })

  it.each([
    ['Real Madrid'],
    ['Juventus'],
    ['AS Cannes'],
    ['Levante UD'],
    ['Girondins de Bordeaux'],
    // The acute accent and the trailing vowel are the whole difference with
    // "Atlètic": one is a first division club, the other is Barcelona's reserve.
    ['Atlético Madrid'],
    ['Athletic Bilbao'],
    // A senior club whose name merely ends in a word starting with B or C.
    ['Stade Malherbe Caen'],
    ['Botafogo'],
  ])('leaves %s alone', (clubName) => {
    expect(isLikelyReserveTeam(clubName)).toBe(false)
  })

  it('reads the English name too, which is the one the measurement was made on', () => {
    // `docs/research/wikidata-coverage.md` §4.3 measured the label signal on
    // English labels, and the model keeps `clubs.en_name` as the admin's
    // fallback. A French name that lost the marker must not hide the club.
    expect(isLikelyReserveTeam('Bayern Munich espoirs', 'Bayern Munich II')).toBe(true)
    expect(isLikelyReserveTeam('Bayern Munich', null)).toBe(false)
  })

  it('is a label heuristic and says so by getting a known false positive wrong', () => {
    // Measured in `docs/research/wikidata-coverage.md` §4.3: the label is the
    // best of the three signals and still noisy. This is exactly why nothing is
    // ever deleted automatically — the admin decides.
    expect(isLikelyReserveTeam('Paris Saint-Germain B')).toBe(true)
  })
})

describe('passagesOverlap', () => {
  it('does not call a handover an overlap', () => {
    // The normal shape of a career: one spell ends the year the next begins.
    // Flagging it would flag every career and mean nothing.
    const cannes = passage({ id: 'a', startYear: 1988, endYear: 1992 })
    const bordeaux = passage({ id: 'b', startYear: 1992, endYear: 1996 })

    expect(passagesOverlap(cannes, bordeaux)).toBe(false)
    expect(passagesOverlap(bordeaux, cannes)).toBe(false)
  })

  it('flags a loan that overlaps the contract it was made from', () => {
    // The case the alert exists for: both start the same year, and the order
    // between them is the only genuinely ambiguous one.
    const contract = passage({ id: 'a', startYear: 2015, endYear: 2019 })
    const loan = passage({ id: 'b', startYear: 2015, endYear: 2016, isLoan: true })

    expect(passagesOverlap(contract, loan)).toBe(true)
  })

  it('flags a short spell sitting inside a longer one', () => {
    const contract = passage({ id: 'a', startYear: 2010, endYear: 2016 })
    const inside = passage({ id: 'b', startYear: 2015, endYear: 2015 })

    expect(passagesOverlap(contract, inside)).toBe(true)
  })

  it('flags two passages the source duplicated', () => {
    const first = passage({ id: 'a', startYear: 2012, endYear: 2015 })
    const second = passage({ id: 'b', startYear: 2012, endYear: 2015 })

    expect(passagesOverlap(first, second)).toBe(true)
  })

  it('treats an open spell as running forever', () => {
    const open = passage({ id: 'a', startYear: 2020, endYear: null })
    const later = passage({ id: 'b', startYear: 2022, endYear: 2024 })

    expect(passagesOverlap(open, later)).toBe(true)
  })

  it('does not flag the spell that hands over to an open one', () => {
    const before = passage({ id: 'a', startYear: 2018, endYear: 2020 })
    const open = passage({ id: 'b', startYear: 2020, endYear: null })

    expect(passagesOverlap(before, open)).toBe(false)
  })

  it('flags a one-season spell nested at the end of a longer one', () => {
    // The handover exclusion must not swallow this: 1992-1992 sits *inside*
    // 1990-1992, so nobody handed over to anybody — it is the
    // loan-inside-a-contract shape the alert exists for.
    const contract = passage({ id: 'a', startYear: 1990, endYear: 1992 })
    const nested = passage({ id: 'b', startYear: 1992, endYear: 1992 })

    expect(passagesOverlap(contract, nested)).toBe(true)
    expect(passagesOverlap(nested, contract)).toBe(true)
  })

  it('flags a one-season spell nested at the start of a longer one', () => {
    const nested = passage({ id: 'a', startYear: 2010, endYear: 2010 })
    const contract = passage({ id: 'b', startYear: 2010, endYear: 2014 })

    expect(passagesOverlap(nested, contract)).toBe(true)
  })

  it('flags two spells that both end the same year', () => {
    const long = passage({ id: 'a', startYear: 2010, endYear: 2015 })
    const short = passage({ id: 'b', startYear: 2013, endYear: 2015 })

    expect(passagesOverlap(long, short)).toBe(true)
  })

  it('flags two careers left open at once', () => {
    // Two spells in progress cannot both be true, and the pair sorts by id
    // alone — the most ambiguous order there is.
    const first = passage({ id: 'a', startYear: 2019, endYear: null })
    const second = passage({ id: 'b', startYear: 2022, endYear: null })

    expect(passagesOverlap(first, second)).toBe(true)
  })

  it('leaves two spells years apart alone', () => {
    const early = passage({ id: 'a', startYear: 2008, endYear: 2011 })
    const late = passage({ id: 'b', startYear: 2014, endYear: 2017 })

    expect(passagesOverlap(early, late)).toBe(false)
  })
})

describe('flagPassages', () => {
  it('returns the passages in career order, each with its flags', () => {
    const flagged = flagPassages([
      passage({ id: 'b', clubName: 'Levante UD', startYear: 2020, endYear: null, matches: 52, goals: 7 }),
      passage({ id: 'a', clubName: 'FC Barcelone C', startYear: 2018, endYear: 2020, matches: 41, goals: 3 }),
    ])

    expect(flagged.map((p) => [p.id, p.flags])).toEqual([
      ['a', ['likely-reserve']],
      ['b', []],
    ])
  })

  it('flags both sides of an overlap, never only one', () => {
    const flagged = flagPassages([
      passage({ id: 'contract', startYear: 2015, endYear: 2019 }),
      passage({ id: 'loan', startYear: 2015, endYear: 2016, isLoan: true }),
    ])

    expect(flagged.every((p) => p.flags.includes('overlap'))).toBe(true)
  })

  it('flags a passage missing its matches or its goals', () => {
    // Not an error: it is the work left to do, and hint 4 or 5 would be empty.
    const flagged = flagPassages([
      passage({ id: 'a', startYear: 2009, endYear: 2013, matches: null, goals: null }),
      passage({ id: 'b', startYear: 2013, endYear: 2016, matches: 74, goals: null }),
      passage({ id: 'c', startYear: 2016, endYear: 2019, matches: 30, goals: 4 }),
    ])

    expect(flagged.map((p) => p.flags)).toEqual([
      ['missing-figures'],
      ['missing-figures'],
      [],
    ])
  })

  it('carries every flag a passage earns at once', () => {
    const flagged = flagPassages([
      passage({ id: 'a', clubName: 'Real Sociedad B', startYear: 2015, endYear: 2018, matches: null, goals: null }),
      passage({ id: 'b', clubName: 'Real Sociedad', startYear: 2015, endYear: 2020 }),
    ])

    expect(flagged[0]?.flags).toEqual(['likely-reserve', 'overlap', 'missing-figures'])
    expect(flagged[1]?.flags).toEqual(['overlap'])
  })

  it('flags nothing on a career the source got right', () => {
    const flagged = flagPassages([
      passage({ id: 'a', clubName: 'AS Cannes', startYear: 1988, endYear: 1992, matches: 61, goals: 6 }),
      passage({ id: 'b', clubName: 'Girondins de Bordeaux', startYear: 1992, endYear: 1996, matches: 139, goals: 28 }),
      passage({ id: 'c', clubName: 'Juventus', startYear: 1996, endYear: 2001, matches: 151, goals: 24 }),
      passage({ id: 'd', clubName: 'Real Madrid', startYear: 2001, endYear: 2006, matches: 155, goals: 37 }),
    ])

    expect(flagged.flatMap((p) => p.flags)).toEqual([])
  })

  it('handles an empty career', () => {
    expect(flagPassages([])).toEqual([])
  })
})
