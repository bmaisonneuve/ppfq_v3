import 'server-only'

import { LOAN_QID } from './career-statements'
import type { CareerStatement, StatementRank } from './career-statements'
import type { WikidataCountry } from './nationality'
import { booleanValue, entityId, integerValue } from './sparql'
import type { SparqlQueryRunner, SparqlRow } from './sparql'

/**
 * The two queries that read one footballer, and the mapping of their rows.
 *
 * This is the adapter to the source: it knows the property numbers and the
 * shape of the answer, and it knows nothing about what any of it means. The
 * meaning is in `career-statements.ts` and `nationality.ts`, both pure.
 *
 * ## Full statements, never `wdt:`
 *
 * `wdt:P54` returns only the preferred-rank statements. Wikidata marks an
 * active player's current club as preferred, so `wdt:` hides his whole career:
 * Messi has one club through it. Everything here goes through `p:P54 / ps:P54`
 * and reads the qualifiers on the statement, which is also the only way to see
 * the years, the matches, the goals and the loan marker at all.
 *
 * ## Two queries rather than one
 *
 * Identity and career are asked separately and in parallel. Joined into one
 * query, the two nationality properties would multiply every statement row by
 * every country, and 8 statements would come back as 16 rows differing in one
 * column.
 */

/** `Q937857`, "association football player" — the occupation, gender-neutral. */
const FOOTBALLER_OCCUPATION = 'Q937857'

/** `Q476028`, "association football club". */
const FOOTBALL_CLUB_CLASS = 'Q476028'

/** `Q6979593`, "national association football team". */
const NATIONAL_TEAM_CLASS = 'Q6979593'

const PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
`

/** A footballer as the source describes him, before anything is decided. */
export type WikidataFootballer = {
  qid: string
  /**
   * `P106 = Q937857`. False is the guard rail that matters: three of the four
   * Wikidata ids in the original brief pointed at an Italian commune and two
   * Brazilian states, and importing one of those would put "Amazonas" in the
   * catalogue with a plausible-looking career.
   */
  isFootballer: boolean
  frName: string | null
  enName: string | null
  sitelinks: number | null
  wikiFrUrl: string | null
  wikiEnUrl: string | null
  countries: WikidataCountry[]
  statements: CareerStatement[]
}

/** Rejected before any query is sent — the qid is interpolated into SPARQL. */
export class InvalidWikidataIdError extends Error {
  constructor(qid: string) {
    super(`"${qid}" is not a Wikidata item id (expected something like Q1835).`)
    this.name = 'InvalidWikidataIdError'
  }
}

/**
 * The only thing that reaches the query text from outside, so it is checked
 * rather than escaped: an item id is `Q` and digits, and anything else is
 * refused before a request is built.
 */
export function assertWikidataId(qid: string): string {
  if (!/^Q[1-9]\d*$/.test(qid)) throw new InvalidWikidataIdError(qid)
  return qid
}

export function identityQuery(qid: string): string {
  const item = `wd:${assertWikidataId(qid)}`
  return `${PREFIXES}
SELECT ?isFootballer ?nameFr ?nameEn ?sitelinks ?frwiki ?enwiki
       ?country ?countryKind ?alpha2 ?subdivision ?alpha3 ?countryFr ?countryEn WHERE {
  BIND(EXISTS { ${item} wdt:P106 wd:${FOOTBALLER_OCCUPATION} } AS ?isFootballer)
  OPTIONAL { ${item} rdfs:label ?nameFr . FILTER(LANG(?nameFr) = 'fr') }
  OPTIONAL { ${item} rdfs:label ?nameEn . FILTER(LANG(?nameEn) = 'en') }
  OPTIONAL { ${item} wikibase:sitelinks ?sitelinks }
  OPTIONAL { ?frwiki schema:about ${item} ; schema:isPartOf <https://fr.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ${item} ; schema:isPartOf <https://en.wikipedia.org/> }
  # OPTIONAL around the UNION: a footballer with neither P1532 nor P27 must
  # still come back, otherwise "no nationality" reads as "no such item".
  OPTIONAL {
    { ${item} wdt:P1532 ?country . BIND('sport' AS ?countryKind) }
    UNION
    { ${item} wdt:P27 ?country . BIND('citizenship' AS ?countryKind) }
    OPTIONAL { ?country wdt:P297 ?alpha2 }
    OPTIONAL { ?country wdt:P300 ?subdivision }
    OPTIONAL { ?country wdt:P298 ?alpha3 }
    OPTIONAL { ?country rdfs:label ?countryFr . FILTER(LANG(?countryFr) = 'fr') }
    OPTIONAL { ?country rdfs:label ?countryEn . FILTER(LANG(?countryEn) = 'en') }
  }
}`
}

export function careerQuery(qid: string): string {
  const item = `wd:${assertWikidataId(qid)}`
  return `${PREFIXES}
SELECT ?statement ?club ?clubFr ?clubEn ?start ?end ?matches ?goals ?nature ?rank
       ?isClub ?isNational WHERE {
  ${item} p:P54 ?statement .
  ?statement ps:P54 ?club .
  ?statement wikibase:rank ?rank .
  OPTIONAL { ?club rdfs:label ?clubFr . FILTER(LANG(?clubFr) = 'fr') }
  OPTIONAL { ?club rdfs:label ?clubEn . FILTER(LANG(?clubEn) = 'en') }
  OPTIONAL { ?statement pq:P580 ?startDate . BIND(YEAR(?startDate) AS ?start) }
  OPTIONAL { ?statement pq:P582 ?endDate . BIND(YEAR(?endDate) AS ?end) }
  OPTIONAL { ?statement pq:P1350 ?matches }
  OPTIONAL { ?statement pq:P1351 ?goals }
  OPTIONAL { ?statement pq:P1642 ?nature }
  BIND(EXISTS { ?club wdt:P31/wdt:P279* wd:${FOOTBALL_CLUB_CLASS} } AS ?isClub)
  BIND(EXISTS { ?club wdt:P31/wdt:P279* wd:${NATIONAL_TEAM_CLASS} } AS ?isNational)
}`
}

/** Reads one footballer. Both queries fly at once; either one failing fails it. */
export async function fetchWikidataFootballer(
  qid: string,
  runQuery: SparqlQueryRunner,
): Promise<WikidataFootballer> {
  assertWikidataId(qid)

  const [identityRows, careerRows] = await Promise.all([
    runQuery(identityQuery(qid)),
    runQuery(careerQuery(qid)),
  ])

  return {
    qid,
    ...readIdentity(identityRows),
    statements: readStatements(careerRows),
  }
}

/**
 * The identity rows: one per country, all carrying the same footballer columns.
 * An item with no country at all still produces one row, thanks to the OPTIONAL
 * around the UNION — and an item that does not exist produces one too, with
 * `isFootballer` false and nothing else, which is the case the caller refuses.
 */
function readIdentity(rows: readonly SparqlRow[]): Omit<WikidataFootballer, 'qid' | 'statements'> {
  const first: SparqlRow = rows[0] ?? {}

  const countries = new Map<string, WikidataCountry>()
  for (const row of rows) {
    const countryQid = entityId(row.country)
    const kind = row.countryKind
    if (countryQid === null || (kind !== 'sport' && kind !== 'citizenship')) continue
    countries.set(`${countryQid}:${kind}`, {
      qid: countryQid,
      kind,
      alpha2: row.alpha2 ?? null,
      subdivision: row.subdivision ?? null,
      alpha3: row.alpha3 ?? null,
      frName: row.countryFr ?? null,
      enName: row.countryEn ?? null,
    })
  }

  return {
    isFootballer: booleanValue(first.isFootballer),
    frName: first.nameFr ?? null,
    enName: first.nameEn ?? null,
    sitelinks: integerValue(first.sitelinks),
    wikiFrUrl: decodeWikiUrl(first.frwiki),
    wikiEnUrl: decodeWikiUrl(first.enwiki),
    countries: [...countries.values()],
  }
}

/**
 * Folds the career rows into one statement each.
 *
 * A qualifier can carry several values — that is why every count in
 * `docs/research/wikidata-coverage.md` is a `COUNT(DISTINCT ?st)` — and each
 * extra value is another row for the same statement. Two `P580`s are two
 * claims about when a spell began, so the fold takes the earliest start and the
 * latest end, and the larger of two counts. Arbitrary, but the same on every
 * run, and the alternative is the same passage appearing twice.
 */
function readStatements(rows: readonly SparqlRow[]): CareerStatement[] {
  const statements = new Map<string, CareerStatement>()

  for (const row of rows) {
    const statementId = entityId(row.statement)
    const clubQid = entityId(row.club)
    if (statementId === null || clubQid === null) continue

    const held = statements.get(statementId)
    const read: CareerStatement = {
      statementId,
      clubQid,
      clubFrName: row.clubFr ?? null,
      clubEnName: row.clubEn ?? null,
      startYear: integerValue(row.start),
      endYear: integerValue(row.end),
      matches: integerValue(row.matches),
      goals: integerValue(row.goals),
      natureQid: entityId(row.nature),
      rank: readRank(row.rank),
      isFootballClub: booleanValue(row.isClub),
      isNationalTeam: booleanValue(row.isNational),
    }

    statements.set(statementId, held ? foldStatement(held, read) : read)
  }

  return [...statements.values()]
}

function foldStatement(held: CareerStatement, read: CareerStatement): CareerStatement {
  return {
    ...held,
    startYear: pick(held.startYear, read.startYear, Math.min),
    endYear: pick(held.endYear, read.endYear, Math.max),
    matches: pick(held.matches, read.matches, Math.max),
    goals: pick(held.goals, read.goals, Math.max),
    // A statement that says "loan" among several natures is a loan: the other
    // values ("transfer", "free transfer") describe the move, not the spell.
    natureQid: [held.natureQid, read.natureQid].includes(LOAN_QID)
      ? LOAN_QID
      : (held.natureQid ?? read.natureQid),
  }
}

function pick(
  held: number | null,
  read: number | null,
  choose: (a: number, b: number) => number,
): number | null {
  if (held === null) return read
  if (read === null) return held
  return choose(held, read)
}

/**
 * `http://wikiba.se/ontology#PreferredRank` → `preferred`.
 *
 * A rank is an ontology term, so it is a `#` fragment and not the last path
 * segment: `entityId` would read it as `ontology#PreferredRank` and every
 * statement would come out `normal` — including the deprecated ones, which are
 * the only reason this is read at all.
 */
function readRank(rank: string | undefined): StatementRank {
  const term = rank?.slice(rank.lastIndexOf('#') + 1)
  if (term === 'DeprecatedRank') return 'deprecated'
  if (term === 'PreferredRank') return 'preferred'
  return 'normal'
}

/**
 * `.../Zin%C3%A9dine_Zidane` → `.../Zinédine_Zidane`.
 *
 * The referential extract stores its Wikipedia links decoded, and these rows
 * sit in the same two columns: two spellings of one link would make a
 * re-import look like a change. A link Node refuses to decode is kept as it
 * came — it is a link for a human to click, not a key.
 */
function decodeWikiUrl(url: string | undefined): string | null {
  if (url === undefined) return null
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}
