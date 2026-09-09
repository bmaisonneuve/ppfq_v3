import { describe, expect, it } from 'vitest'

import {
  booleanValue,
  entityId,
  integerValue,
  readBindings,
  SparqlError,
} from '@/server/ingest/sparql'
import {
  assertWikidataId,
  careerQuery,
  fetchWikidataFootballer,
  identityQuery,
  InvalidWikidataIdError,
} from '@/server/ingest/wikidata-career'

import { RECORDED, careerRow, recordedRunner, wikidataRunner } from '@test/fixtures/wikidata'

/**
 * The adapter to the source: the queries, and the reading of what comes back.
 *
 * No network here either — the runner is handed over, which is the whole point
 * of that seam. What is checked is the mapping and the two habits the endpoint
 * has that a reader must survive: counts serialised as decimals, and unbound
 * variables that simply are not there.
 */
describe('the queries', () => {
  it('never uses wdt:P54, which would hide an active career', () => {
    // `wdt:` returns preferred-rank statements only, and an active player's
    // current club is marked preferred: Messi has one club through it.
    const query = careerQuery('Q615')

    expect(query).toContain('p:P54 ?statement')
    expect(query).toContain('?statement ps:P54 ?club')
    expect(query).not.toMatch(/wdt:P54/)
  })

  it('asks for the club test and the selection test separately', () => {
    const query = careerQuery('Q615')

    expect(query).toContain('wdt:P31/wdt:P279* wd:Q476028')
    expect(query).toContain('wdt:P31/wdt:P279* wd:Q6979593')
  })

  it('asks for the sporting country and the citizenships in one read', () => {
    const query = identityQuery('Q10520')

    expect(query).toContain('wdt:P1532')
    expect(query).toContain('wdt:P27')
    expect(query).toContain('wdt:P106 wd:Q937857')
  })

  it('refuses anything that is not an item id, before building a query', () => {
    // The qid is the only thing that reaches the query text from outside, so it
    // is validated rather than escaped.
    expect(() => assertWikidataId('Q1835')).not.toThrow()
    for (const bad of ['', 'q1835', 'Q', 'Q0', 'P54', '1835', 'Q18 35', 'Q1835}']) {
      expect(() => careerQuery(bad)).toThrow(InvalidWikidataIdError)
    }
  })
})

describe('reading the results payload', () => {
  it('keeps the bound variables and drops the absent ones', () => {
    const rows = readBindings({
      head: { vars: ['start', 'end'] },
      results: {
        bindings: [
          {
            start: { datatype: 'http://www.w3.org/2001/XMLSchema#int', value: '2013' },
          },
        ],
      },
    })

    expect(rows).toEqual([{ start: '2013' }])
    // The difference CSV cannot express, and the reason JSON is asked for: "no
    // end year" is a missing key, not an empty string.
    expect('end' in (rows[0] ?? {})).toBe(false)
  })

  it('refuses a payload that is not SPARQL results', () => {
    expect(() => readBindings({ error: 'parse error' })).toThrow(SparqlError)
    expect(() => readBindings(null)).toThrow(SparqlError)
  })

  it('reads a count that arrives as a decimal', () => {
    // QLever hands `pq:P1350` back as xsd:decimal: 28 matches arrive as "28.0".
    expect(integerValue('28.0')).toBe(28)
    expect(integerValue('2013')).toBe(2013)
    expect(integerValue(undefined)).toBeNull()
    expect(integerValue('')).toBe(0)
    expect(integerValue('none')).toBeNull()
  })

  it('reads an entity id out of its URI', () => {
    expect(entityId('http://www.wikidata.org/entity/Q1835')).toBe('Q1835')
    expect(entityId(undefined)).toBeNull()
    // Not for a rank: an ontology term is a `#` fragment, not a path segment.
    // Reading one with this is how every statement ends up "normal".
    expect(entityId('http://wikiba.se/ontology#PreferredRank')).toBe(
      'ontology#PreferredRank',
    )
  })

  it('reads a boolean as the string it is', () => {
    expect(booleanValue('true')).toBe(true)
    expect(booleanValue('false')).toBe(false)
    expect(booleanValue(undefined)).toBe(false)
  })
})

describe('fetchWikidataFootballer', () => {
  it('reads Zidane whole', async () => {
    const footballer = await fetchWikidataFootballer(
      RECORDED.zidane,
      recordedRunner(RECORDED.zidane),
    )

    expect(footballer).toMatchObject({
      qid: 'Q1835',
      isFootballer: true,
      frName: 'Zinedine Zidane',
      sitelinks: 145,
      // Decoded, like the referential extract stores it: two spellings of one
      // link would make a re-import look like a change.
      wikiFrUrl: 'https://fr.wikipedia.org/wiki/Zinédine_Zidane',
    })
    expect(footballer.statements).toHaveLength(9)
    expect(footballer.countries).toHaveLength(2)
  })

  it('reads a statement’s qualifiers, and the rank Wikidata gives it', async () => {
    const footballer = await fetchWikidataFootballer(
      RECORDED.messi,
      recordedRunner(RECORDED.messi),
    )

    const miami = footballer.statements.find((s) => s.clubQid === 'Q16844931')
    expect(miami).toMatchObject({
      clubFrName: 'Inter Miami CF',
      startYear: 2023,
      endYear: null,
      matches: 72,
      goals: 68,
      rank: 'preferred',
      isFootballClub: true,
      isNationalTeam: false,
    })

    const psg = footballer.statements.find((s) => s.clubQid === 'Q483020')
    expect(psg?.natureQid).toBe('Q1811518')
    expect(psg?.rank).toBe('normal')
  })

  it('reads an item that is not a footballer at all', async () => {
    // Q42816 is an Italian commune with 48 sitelinks. Three of the four ids in
    // the original brief were items like this one.
    const footballer = await fetchWikidataFootballer(
      RECORDED.commune,
      recordedRunner(RECORDED.commune),
    )

    expect(footballer.isFootballer).toBe(false)
    expect(footballer.statements).toEqual([])
    expect(footballer.countries).toEqual([])
  })

  it('reads a footballer the source does not name in French or English', async () => {
    // Q615's labels in the QLever index carry no language tag, so both come
    // back empty. He has a name in the referential; a footballer who does not
    // is one the import refuses to create.
    const footballer = await fetchWikidataFootballer(
      RECORDED.messi,
      recordedRunner(RECORDED.messi),
    )

    expect(footballer.frName).toBeNull()
    expect(footballer.enName).toBeNull()
    expect(footballer.sitelinks).toBe(225)
  })

  it('folds a qualifier declared twice into one statement', async () => {
    // Several values of one qualifier are several rows for one statement, which
    // is why every count in the research doc is a COUNT(DISTINCT ?st). Folded:
    // earliest start, latest end, larger count — the same on every run, where
    // two rows would be the same passage twice.
    const runner = wikidataRunner({
      identity: [],
      career: [
        careerRow({ statement: 'x', start: '1996', end: '2000', matches: '151.0' }),
        careerRow({ statement: 'x', start: '1997', end: '2001', matches: '160.0' }),
      ],
    })

    const { statements } = await fetchWikidataFootballer('Q1835', runner)

    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatchObject({ startYear: 1996, endYear: 2001, matches: 160 })
  })

  it('calls a statement a loan when one of its natures says loan', async () => {
    const runner = wikidataRunner({
      identity: [],
      career: [
        careerRow({ statement: 'x', nature: 'http://www.wikidata.org/entity/Q1811518' }),
        careerRow({ statement: 'x', nature: 'http://www.wikidata.org/entity/Q2914547' }),
      ],
    })

    const { statements } = await fetchWikidataFootballer('Q1835', runner)

    expect(statements[0]?.natureQid).toBe('Q2914547')
  })
})
