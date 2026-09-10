import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SparqlQueryRunner, SparqlRow } from '@/server/ingest/sparql'

/**
 * The recorded halves of Wikidata: what the endpoint really answered for seven
 * items on 2026-09-09, and the fake runner that replays them.
 *
 * The suite never goes to the network. It does not go to a payload written by
 * hand either: `pnpm fixtures:wikidata` captures these files with the very
 * queries the pipeline sends, so what the tests assert is what the source
 * actually contains — `"28.0"` for a count of matches, no French label for
 * Messi, France's national team typed as a football club.
 *
 * Refreshing them is a review, not a chore: Wikidata moves, and a `git diff`
 * on these files is the only place a change in the source becomes visible.
 */
const DIRECTORY = join(import.meta.dirname, 'wikidata')

/** The seven items, by what each one is here to prove. */
export const RECORDED = {
  /** Four clubs, five selections, every qualifier present. The easy case. */
  zidane: 'Q1835',
  /** Two untyped reserve teams, a PSG transfer that is not a loan, no fr/en label. */
  messi: 'Q615',
  /** Three loans, and Marseille 1988-1991 missing from the source entirely. */
  cantona: 'Q170328',
  /** A 2026 spell at Ravenna he never played, and a selection with no dates. */
  ronaldinho: 'Q39444',
  /** Median notoriety: half the passages carry no statistics, one reserve team. */
  leipertz: 'Q102035',
  /** England for sport, United Kingdom for citizenship — and two loan spells. */
  beckham: 'Q10520',
  /** An Italian commune. One of the ids the original brief called a footballer. */
  commune: 'Q42816',
} as const

export type RecordedItem = (typeof RECORDED)[keyof typeof RECORDED]

type Recording = {
  qid: string
  what: string
  capturedAt: string
  identity: SparqlRow[]
  career: SparqlRow[]
}

export function recordedWikidata(qid: RecordedItem): Recording {
  return JSON.parse(readFileSync(join(DIRECTORY, `${qid}.json`), 'utf8')) as Recording
}

export type RunnerOptions = {
  /** Makes that half of the read fail, to test what a failed run leaves behind. */
  failOn?: 'identity' | 'career'
}

/**
 * A runner over recorded rows.
 *
 * It tells the two queries apart the way anything downstream of the endpoint
 * has to: the career query is the one that asks for `p:P54`. Handing back the
 * identity rows for a career query would make every career look empty, so the
 * distinction is asserted rather than assumed.
 */
export function recordedRunner(
  qid: RecordedItem,
  options: RunnerOptions = {},
): SparqlQueryRunner {
  const recording = recordedWikidata(qid)
  return wikidataRunner(recording, options)
}

/** The same replay over rows a test writes itself. */
export function wikidataRunner(
  rows: { identity: SparqlRow[]; career: SparqlRow[] },
  options: RunnerOptions = {},
): SparqlQueryRunner {
  // `promise-function-async` wants the async keyword on anything answering a
  // promise, and this replay has nothing to await. The signature wins.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (query: string) => {
    const half = query.includes('p:P54') ? 'career' : 'identity'
    if (options.failOn === half) {
      throw new Error(`The SPARQL endpoint did not answer the ${half} query.`)
    }
    return rows[half]
  }
}

/**
 * One row of the career query, with the columns a plain senior spell has.
 *
 * Values are the endpoint's own lexical forms — `'28.0'` for a count, `'true'`
 * for a boolean — because that is what the mapping has to cope with. A test
 * that needs a missing qualifier omits the key, exactly as the endpoint omits
 * an unbound variable.
 */
export function careerRow(overrides: Partial<Record<string, string>> = {}): SparqlRow {
  return {
    statement: 'http://www.wikidata.org/entity/statement/q1-AAAA',
    club: 'http://www.wikidata.org/entity/Q1422',
    clubFr: 'Juventus FC',
    clubEn: 'Juventus FC',
    start: '1996',
    end: '2001',
    matches: '151.0',
    goals: '24.0',
    rank: 'http://wikiba.se/ontology#NormalRank',
    isClub: 'true',
    isNational: 'false',
    ...overrides,
  }
}

/** One row of the identity query: a footballer with one French nationality. */
export function identityRow(overrides: Partial<Record<string, string>> = {}): SparqlRow {
  return {
    isFootballer: 'true',
    nameFr: 'Théo Balland',
    nameEn: 'Theo Balland',
    sitelinks: '11',
    country: 'http://www.wikidata.org/entity/Q142',
    countryKind: 'sport',
    alpha2: 'FR',
    alpha3: 'FRA',
    countryFr: 'France',
    countryEn: 'France',
    ...overrides,
  }
}
