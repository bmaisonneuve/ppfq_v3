import { describe, expect, it } from 'vitest'

import { LOAN_QID, readSeniorCareer } from '@/server/ingest/career-statements'
import type { CareerStatement } from '@/server/ingest/career-statements'
import { fetchWikidataFootballer } from '@/server/ingest/wikidata-career'

import { RECORDED, recordedRunner } from '@test/fixtures/wikidata'
import type { RecordedItem } from '@test/fixtures/wikidata'

/**
 * The reading of `P54`, case by case.
 *
 * Half of these run on statements written here — the shapes that make a rule
 * fail are easier to state than to find in a real career — and half on the
 * recorded answers of `test/fixtures/wikidata/`, which is where the rules are
 * confronted with what the source actually holds.
 *
 * Every expectation here traces back to a measurement in
 * `docs/research/wikidata-coverage.md`.
 */
const statement = (overrides: Partial<CareerStatement> = {}): CareerStatement => ({
  statementId: 'q1-AAAA',
  clubQid: 'Q1422',
  clubFrName: 'Juventus FC',
  clubEnName: 'Juventus FC',
  startYear: 1996,
  endYear: 2001,
  matches: 151,
  goals: 24,
  natureQid: null,
  rank: 'normal',
  isFootballClub: true,
  isNationalTeam: false,
  ...overrides,
})

const recorded = (qid: RecordedItem) =>
  fetchWikidataFootballer(qid, recordedRunner(qid)).then((footballer) =>
    readSeniorCareer(footballer.statements),
  )

describe('what counts as a club', () => {
  it('keeps a team that is a football club by subclass', () => {
    // FC Barcelona is not `P31 Q476028` — its types are "men's association
    // football team" and "professional sports team". A rule strict enough to
    // ask for the exact type loses it, which is why the rule walks P279*.
    const { passages } = readSeniorCareer([
      statement({ clubQid: 'Q7156', clubFrName: 'FC Barcelone' }),
    ])

    expect(passages.map((p) => p.clubQid)).toEqual(['Q7156'])
  })

  it('drops a national selection even when it is also typed a football club', () => {
    // The trap, measured: "men's national association football team" is a
    // subclass of "association football club", so 54 010 selection statements
    // pass the club test. France's own team is one of them.
    const { passages, skipped } = readSeniorCareer([
      statement({ clubQid: 'Q47774', isFootballClub: true, isNationalTeam: true }),
    ])

    expect(passages).toEqual([])
    expect(skipped.nationalTeam).toBe(1)
    expect(skipped.notAFootballClub).toBe(0)
  })

  it('drops a team that is neither a club nor a selection, and says so', () => {
    // 3.6 % of the source: mostly senior clubs typed "sports club", and some
    // plain noise. Counted rather than silently lost.
    const { passages, skipped } = readSeniorCareer([
      statement({ isFootballClub: false, isNationalTeam: false }),
    ])

    expect(passages).toEqual([])
    expect(skipped.notAFootballClub).toBe(1)
  })

  it('lets an untyped reserve team into the catalogue', () => {
    // Expected behaviour, not a leak: FC Barcelona C is typed "association
    // football club" and nothing else. No structural signal exists, so an
    // admin removes it by hand at curation.
    const { passages } = readSeniorCareer([
      statement({ clubQid: 'Q2346842', clubFrName: 'FC Barcelone C' }),
    ])

    expect(passages.map((p) => p.clubFrName)).toEqual(['FC Barcelone C'])
  })
})

describe('what counts as a loan', () => {
  it('reads a loan from the value of the qualifier', () => {
    const { passages } = readSeniorCareer([statement({ natureQid: LOAN_QID })])

    expect(passages[0]?.isLoan).toBe(true)
  })

  it('does not read a plain transfer as a loan', () => {
    // Messi's move to PSG carries P1642 = "transfer" (Q1811518). Testing the
    // *presence* of the qualifier would annotate it as a loan; 1 804
    // statements in the source are in that case.
    const { passages } = readSeniorCareer([statement({ natureQid: 'Q1811518' })])

    expect(passages[0]?.isLoan).toBe(false)
  })

  it('does not read a statement without the qualifier as a loan', () => {
    // 91 % of the source carries no P1642 at all, and a plain transfer is the
    // default rather than something to infer.
    const { passages } = readSeniorCareer([statement({ natureQid: null })])

    expect(passages[0]?.isLoan).toBe(false)
  })
})

describe('a passage the model cannot carry', () => {
  it('drops a statement with no start year, and counts it', () => {
    // `start_year` is NOT NULL and it carries the order of a parcours: a spell
    // with no P580 has no place in the sequence. 15.6 % of the source.
    const { passages, skipped } = readSeniorCareer([statement({ startYear: null })])

    expect(passages).toEqual([])
    expect(skipped.noStartYear).toBe(1)
  })

  it('drops a statement Wikidata itself flags as wrong', () => {
    const { passages, skipped } = readSeniorCareer([statement({ rank: 'deprecated' })])

    expect(passages).toEqual([])
    expect(skipped.deprecated).toBe(1)
  })

  it('accounts for every statement exactly once', () => {
    // What makes the run's trace worth reading: read = kept + skipped.
    const statements = [
      statement({ statementId: 'a' }),
      statement({ statementId: 'b', isNationalTeam: true }),
      statement({ statementId: 'c', isFootballClub: false }),
      statement({ statementId: 'd', startYear: null }),
      statement({ statementId: 'e', rank: 'deprecated' }),
      statement({ statementId: 'f' }),
    ]

    const { passages, skipped } = readSeniorCareer(statements)
    const dropped = Object.values(skipped).reduce((sum, n) => sum + n, 0)

    expect(passages).toHaveLength(1)
    expect(dropped).toBe(5)
  })
})

describe('a duplicated spell', () => {
  const duplicate = (overrides: Partial<CareerStatement>) =>
    statement({ clubQid: 'Q170318', startYear: 2012, ...overrides })

  it('keeps the best-qualified declaration of the two', () => {
    // 6 721 groups in the source, and the one cleanup curation cannot make up
    // for: two rows for one club look exactly like a genuine second spell.
    const { passages, skipped } = readSeniorCareer([
      duplicate({ statementId: 'thin', endYear: null, matches: null, goals: null }),
      duplicate({ statementId: 'full', endYear: 2015, matches: 68, goals: 4 }),
    ])

    expect(passages).toHaveLength(1)
    expect(passages[0]).toMatchObject({ statementId: 'full', matches: 68, goals: 4 })
    expect(skipped.duplicate).toBe(1)
  })

  it('fills only the fields the winner leaves empty', () => {
    // A merge, not an addition: two declarations that disagree on a number of
    // matches are two claims about one season, and their sum would be a third
    // figure nobody states.
    const { passages } = readSeniorCareer([
      duplicate({ statementId: 'figures', endYear: null, matches: 68, goals: 4 }),
      duplicate({ statementId: 'dates', endYear: 2015, matches: null, goals: null }),
    ])

    expect(passages[0]).toMatchObject({
      statementId: 'figures',
      endYear: 2015,
      matches: 68,
      goals: 4,
    })
  })

  it('prefers a documented declaration over a better-ranked empty one', () => {
    // Rank says which claim Wikidata trusts; it does not fill a hint. A
    // preferred statement with no figures would make the footballer
    // unschedulable while a normal one right beside it has everything.
    const { passages } = readSeniorCareer([
      duplicate({ statementId: 'preferred', rank: 'preferred', matches: null, goals: null }),
      duplicate({ statementId: 'documented', matches: 68, goals: 4 }),
    ])

    expect(passages[0]?.statementId).toBe('documented')
  })

  it('uses the rank when both declarations say as much', () => {
    const { passages } = readSeniorCareer([
      duplicate({ statementId: 'normal', matches: 68, goals: 4 }),
      duplicate({ statementId: 'preferred', rank: 'preferred', matches: 68, goals: 4 }),
    ])

    expect(passages[0]?.statementId).toBe('preferred')
  })

  it('picks the same winner whatever order the rows arrive in', () => {
    // Without the last tie-break, two equally documented declarations would
    // swap between two imports and move the parcours under a published grid.
    const a = duplicate({ statementId: 'aaa' })
    const b = duplicate({ statementId: 'bbb' })

    expect(readSeniorCareer([a, b]).passages[0]?.statementId).toBe('aaa')
    expect(readSeniorCareer([b, a]).passages[0]?.statementId).toBe('aaa')
  })

  it('does not confuse a second spell at the same club with a duplicate', () => {
    // Cristiano Ronaldo left Manchester United and came back. The key is
    // (club, start year), so two spells stay two passages.
    const { passages, skipped } = readSeniorCareer([
      statement({ statementId: 'first', clubQid: 'Q18656', startYear: 2003, endYear: 2009 }),
      statement({ statementId: 'again', clubQid: 'Q18656', startYear: 2021, endYear: 2022 }),
    ])

    expect(passages).toHaveLength(2)
    expect(skipped.duplicate).toBe(0)
  })
})

describe('what the source contradicts is reported, never dropped', () => {
  it('flags more goals than matches', () => {
    // 2 989 passages in the source. Blocked at scheduling time, not here: the
    // search referential stays exhaustive.
    const { passages, anomalies } = readSeniorCareer([
      statement({ matches: 5, goals: 8 }),
    ])

    expect(passages).toHaveLength(1)
    expect(anomalies).toEqual([
      { clubQid: 'Q1422', startYear: 1996, reason: 'goals-above-matches' },
    ])
  })

  it('flags an end before its start, and a start before 1880', () => {
    const { anomalies } = readSeniorCareer([
      statement({ statementId: 'backwards', startYear: 1990, endYear: 1989 }),
      statement({ statementId: 'ancient', clubQid: 'Q9999', startYear: 1850, endYear: 1852 }),
    ])

    // In career order, so the 1850 spell comes first.
    expect(anomalies.map((a) => a.reason)).toEqual([
      'starts-before-1880',
      'ends-before-start',
    ])
  })
})

describe('the order of a parcours', () => {
  it('sorts by start year, then by end year', () => {
    const { passages } = readSeniorCareer([
      statement({ statementId: 'c', clubQid: 'Q3', startYear: 2015, endYear: 2019 }),
      statement({ statementId: 'a', clubQid: 'Q1', startYear: 2012, endYear: 2015 }),
      statement({ statementId: 'b', clubQid: 'Q2', startYear: 2015, endYear: 2016 }),
    ])

    expect(passages.map((p) => p.clubQid)).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('puts a spell still in progress last', () => {
    const { passages } = readSeniorCareer([
      statement({ statementId: 'open', clubQid: 'Q1', startYear: 2020, endYear: null }),
      statement({ statementId: 'closed', clubQid: 'Q2', startYear: 2020, endYear: 2021 }),
    ])

    expect(passages.map((p) => p.clubQid)).toEqual(['Q2', 'Q1'])
  })
})

describe('five recorded careers', () => {
  it('reads Zidane as four clubs in order, and five selections out', async () => {
    const { passages, skipped, anomalies } = await recorded(RECORDED.zidane)

    expect(passages.map((p) => [p.clubFrName, p.startYear, p.endYear])).toEqual([
      ['AS Cannes', 1989, 1992],
      ['Girondins de Bordeaux', 1992, 1996],
      ['Juventus FC', 1996, 2001],
      ['Real Madrid CF', 2001, 2006],
    ])
    expect(passages.map((p) => [p.matches, p.goals])).toEqual([
      [61, 6],
      [139, 28],
      [151, 24],
      [155, 37],
    ])
    expect(skipped.nationalTeam).toBe(5)
    expect(anomalies).toEqual([])
  })

  it('keeps Messi at FC Barcelona, keeps the reserves, and drops Argentina', async () => {
    const { passages, skipped } = await recorded(RECORDED.messi)

    expect(passages.map((p) => p.clubFrName)).toEqual([
      'FC Barcelone C',
      'FC Barcelone B',
      'FC Barcelone',
      'Paris Saint-Germain FC',
      'Inter Miami CF',
    ])
    // Three selections, one of which is typed a football club.
    expect(skipped.nationalTeam).toBe(3)
    // Barcelona C and Barcelona B are reserve teams the source does not type
    // as such; the PSG spell carries "transfer", not "loan".
    expect(passages.map((p) => p.isLoan)).toEqual([false, false, false, false, false])
    // The spell in progress: no end year, and last in the sequence.
    expect(passages.at(-1)).toMatchObject({ clubFrName: 'Inter Miami CF', endYear: null })
  })

  it('leaves the hole in Cantona’s career exactly where the source leaves it', async () => {
    // The most instructive case of all: Olympique de Marseille 1988-1991 does
    // not exist in his P54, verified statement by statement. His three loans
    // therefore hang off nothing, and the 1988-1991 gap is visible. A parcours
    // can be complete and false; nothing here pretends otherwise.
    const { passages, anomalies } = await recorded(RECORDED.cantona)

    expect(passages.map((p) => [p.clubFrName, p.startYear, p.endYear, p.isLoan])).toEqual([
      ['AJ Auxerre', 1983, 1988, false],
      ['FC Martigues', 1985, 1986, true],
      ['Girondins de Bordeaux', 1989, 1989, true],
      ['Montpellier Hérault SC', 1989, 1990, true],
      ['Nîmes Olympique', 1991, 1991, false],
      ['Leeds United', 1992, 1992, false],
      ['Manchester United FC', 1992, 1997, false],
    ])
    expect(passages.some((p) => p.clubQid === 'Q132885')).toBe(false)
    // Neither the reading nor the report can say the career is amputated.
    expect(anomalies).toEqual([])
  })

  it('keeps both of Beckham’s loan spells at the same club', async () => {
    const { passages } = await recorded(RECORDED.beckham)

    const milan = passages.filter((p) => p.clubFrName === 'AC Milan')
    expect(milan.map((p) => [p.startYear, p.isLoan])).toEqual([
      [2009, true],
      [2010, true],
    ])
  })

  it('keeps a median career with half its statistics missing', async () => {
    // The profile of the sitelinks ≈ 10 band, and the reason completeness is
    // checked at scheduling time: this footballer is in the catalogue, he is
    // simply not playable yet.
    const { passages } = await recorded(RECORDED.leipertz)

    expect(passages.map((p) => [p.clubFrName, p.matches])).toEqual([
      ['Alemannia Aix-la-Chapelle', 8],
      ['FC Schalke 04', 0],
      ['FC Schalke 04 II', 35],
      ['1. FC Heidenheim 1846', null],
      ['FC Ingolstadt 04', null],
      ['1. FC Heidenheim 1846', null],
    ])
  })

  it('keeps Ronaldinho’s impossible 2026 spell, because nothing can catch it', async () => {
    // 0 matches, 0 goals, eleven years after he retired, at a club he never
    // played for. Every value is in range, so no rule fires and no anomaly is
    // reported. The admin's eye is the only guard, and the model says so.
    const { passages, anomalies } = await recorded(RECORDED.ronaldinho)

    expect(passages.at(-1)).toMatchObject({ clubEnName: 'S.C. Ravenna Sport', startYear: 2026 })
    expect(anomalies).toEqual([])
  })
})
