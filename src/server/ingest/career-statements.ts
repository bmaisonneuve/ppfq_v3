import 'server-only'

/**
 * What Wikidata's `P54` statements mean — the whole reading, as a pure function.
 *
 * No database, no HTTP: statements in, passages out, plus the count of what was
 * dropped and why. That is what makes the rules of
 * `docs/research/wikidata-coverage.md` testable as a matrix in milliseconds,
 * and it is the reason this file sits in `ingest/` rather than in the service
 * that writes its result.
 *
 * The four rules, all of them measured rather than guessed:
 *
 * 1. **A club is `P31/P279* Q476028` minus the national selections.** `P31`
 *    exact is precise and loses FC Barcelona, whose types are "men's
 *    association football team" and "professional sports team". The subclass
 *    walk alone swallows 54 010 national-team statements, because "men's
 *    national association football team" is, on Wikidata, a subclass of
 *    "association football club". Only the subtraction is right — and the
 *    subtracted side is reliable: `P279* Q6979593` catches the A teams, the
 *    U15→U23, the Olympic and B sides, and never overlaps a real club.
 * 2. **A loan is the *value* of `pq:P1642`, `Q2914547`.** The presence of the
 *    qualifier says nothing: 1 804 statements carry it with "transfer", "free
 *    transfer" or "draft" — Messi's move to PSG among them.
 * 3. **Matches and goals are league only** (`P1350`/`P1351` copy the Wikipedia
 *    infobox). Nothing to do here; the game's wording says so at hints 4 and 5.
 * 4. **A duplicate is `(footballer, club, start year)`**, 6 721 groups in the
 *    source, and it is the one cleanup curation cannot make up for: two rows
 *    for one club look exactly like a genuine second spell.
 *
 * A fifth rule the ticket does not ask for, so it is stated here and counted in
 * the report rather than applied quietly: **a deprecated-rank statement is
 * dropped**. That rank means the community holds the claim to be *wrong*, and
 * keeping it would put a known-false club in a parcours. It costs nothing — 116
 * statements out of 1.1 million, 0.01 % (§5ter of the research doc) — and every
 * one of them lands in `skipped.deprecated`, so a career that lost a passage
 * this way says so.
 *
 * What this reading deliberately does *not* do:
 *
 * - **It does not hunt reserve teams.** They are typed like senior clubs — FC
 *   Barcelona C is "association football club" and nothing else — and the three
 *   available signals cover 1.4 % of passages. They enter the catalogue and an
 *   admin removes them by hand (`docs/modele-donnees.md` §3).
 * - **It does not repair a career.** Nothing is invented to fill a hole: Eric
 *   Cantona's Marseille years are simply absent from the source, so his three
 *   loans hang off nothing and the 1988-1991 gap stays visible. A parcours can
 *   be complete and false, and the only guard is the admin's eye.
 * - **It rejects no implausible value.** More goals than matches, an end before
 *   a start, a start before 1880: they are reported and kept. The model blocks
 *   them at scheduling time, not at import — the search referential stays
 *   exhaustive and a footballer with doubtful figures is still a valid
 *   suggestion.
 */

/** `pq:P1642` = "loan". The one value that makes a passage a loan. */
export const LOAN_QID = 'Q2914547'

/** Before this, a start year is a data-entry accident rather than a career. */
const EARLIEST_PLAUSIBLE_YEAR = 1880

/**
 * Wikidata's statement rank. `deprecated` marks a statement the community has
 * flagged as wrong, which is the one rank worth acting on.
 */
export type StatementRank = 'preferred' | 'normal' | 'deprecated'

/** One `P54` statement, as the endpoint hands it over. */
export type CareerStatement = {
  /** The statement's own id. Opaque, and the last tie-break of the sort. */
  statementId: string
  clubQid: string
  clubFrName: string | null
  clubEnName: string | null
  startYear: number | null
  endYear: number | null
  /** League matches (`P1350`). */
  matches: number | null
  /** League goals (`P1351`). */
  goals: number | null
  /** The value of `pq:P1642`, whatever it is. A loan is `LOAN_QID` and only it. */
  natureQid: string | null
  rank: StatementRank
  /** `P31/P279* Q476028`. */
  isFootballClub: boolean
  /** `P31/P279* Q6979593`. Wins over `isFootballClub` when both are true. */
  isNationalTeam: boolean
}

/** One senior spell, ready to become a `player_clubs` row. */
export type ExtractedPassage = {
  clubQid: string
  clubFrName: string | null
  clubEnName: string | null
  isLoan: boolean
  startYear: number
  endYear: number | null
  matches: number | null
  goals: number | null
  /** Where it came from, for a log line. Nothing is stored from this. */
  statementId: string
}

/** Statements read but not turned into a passage, by reason. */
export type SkippedStatements = {
  /** Flagged wrong on Wikidata itself. */
  deprecated: number
  /** A selection: out of scope, and the exclusion is reliable. */
  nationalTeam: number
  /**
   * Neither a club nor a selection — 3.6 % of the source. Mostly real senior
   * clubs typed as "sports club" or "college sports team", and some plain noise
   * (rugby, cricket, "Wikinews article"). Excluding them is the measured
   * definition of a club; the count is here so the loss is visible rather than
   * silent.
   */
  notAFootballClub: number
  /** No `P580`: unorderable, and `start_year` carries the order of a parcours. */
  noStartYear: number
  /** A second declaration of a spell already read. */
  duplicate: number
}

/** A kept passage the source contradicts. Reported, never dropped. */
export type PassageAnomaly = {
  clubQid: string
  startYear: number
  reason: 'goals-above-matches' | 'ends-before-start' | 'starts-before-1880'
}

export type CareerReading = {
  /** In career order: `(start year, end year)`, an open spell last. */
  passages: ExtractedPassage[]
  skipped: SkippedStatements
  anomalies: PassageAnomaly[]
}

/**
 * Reads a footballer's senior career out of his `P54` statements.
 *
 * The filters are applied in one order and each statement lands in exactly one
 * bucket, so the counts add up to the number of statements read — which is what
 * makes the run's trace worth reading.
 */
export function readSeniorCareer(
  statements: readonly CareerStatement[],
): CareerReading {
  const skipped: SkippedStatements = {
    deprecated: 0,
    nationalTeam: 0,
    notAFootballClub: 0,
    noStartYear: 0,
    duplicate: 0,
  }

  /** Declarations of one spell, keyed by `(club, start year)`. */
  const spells = new Map<string, CareerStatement[]>()

  for (const statement of statements) {
    if (statement.rank === 'deprecated') {
      skipped.deprecated += 1
      continue
    }
    // The subtraction, in this order: France's national team is *also* typed a
    // football club, so testing `isFootballClub` first would keep it.
    if (statement.isNationalTeam) {
      skipped.nationalTeam += 1
      continue
    }
    if (!statement.isFootballClub) {
      skipped.notAFootballClub += 1
      continue
    }
    if (statement.startYear === null) {
      skipped.noStartYear += 1
      continue
    }

    const key = `${statement.clubQid}:${statement.startYear}`
    const spell = spells.get(key)
    if (spell) {
      spell.push(statement)
      skipped.duplicate += 1
    } else {
      spells.set(key, [statement])
    }
  }

  const passages = [...spells.values()]
    .map((declarations) => mergeSpell(declarations))
    .sort(byCareerOrder)

  return { passages, skipped, anomalies: passages.flatMap(anomaliesOf) }
}

/**
 * Collapses the declarations of one spell into one passage — merged, with the
 * best-qualified declaration kept.
 *
 * Precisely: no value the winner states is ever replaced, and each field it
 * leaves empty is filled from the best-qualified declaration that does state
 * one. So a passage can end up with its matches from one declaration and its
 * end year from another, and that is the "merged" half of the rule: the
 * alternative is a hint the game cannot show while the figure sits in the
 * source, one row away.
 *
 * What is *not* done is arithmetic. Two declarations that disagree on a number
 * of matches are two claims about the same season, and their sum would be a
 * third figure no source states.
 *
 * `isLoan` is the winner's alone, for the same reason — a loan and a transfer
 * declared for the same club in the same year contradict each other, and the
 * better-documented declaration is the one to believe.
 */
function mergeSpell(declarations: CareerStatement[]): ExtractedPassage {
  const [best, ...rest] = [...declarations].sort(byQualification)
  // `spells` never holds an empty array, and a start year is what got a
  // statement in there in the first place.
  const winner = best as CareerStatement & { startYear: number }

  const fill = <K extends 'endYear' | 'matches' | 'goals'>(field: K): number | null =>
    winner[field] ?? rest.find((other) => other[field] !== null)?.[field] ?? null

  return {
    clubQid: winner.clubQid,
    clubFrName: winner.clubFrName,
    clubEnName: winner.clubEnName,
    isLoan: winner.natureQid === LOAN_QID,
    startYear: winner.startYear,
    endYear: fill('endYear'),
    matches: fill('matches'),
    goals: fill('goals'),
    statementId: winner.statementId,
  }
}

/**
 * Best-qualified first.
 *
 * "Qualified" is first of all how much the declaration says: a passage the game
 * can use needs its matches and its goals, so a declaration carrying them beats
 * one that does not, whatever its rank. Rank then separates the ties, and after
 * it the higher figures — the fuller account of the same spell.
 *
 * The statement id has the last word, and it is not decoration: without it two
 * equally documented declarations would swap between two runs, and the parcours
 * would move under a published grid for no reason at all.
 */
function byQualification(a: CareerStatement, b: CareerStatement): number {
  return (
    filledFields(b) - filledFields(a) ||
    rankWeight(b) - rankWeight(a) ||
    (b.matches ?? -1) - (a.matches ?? -1) ||
    (b.goals ?? -1) - (a.goals ?? -1) ||
    compareStrings(a.statementId, b.statementId)
  )
}

function filledFields(statement: CareerStatement): number {
  return (
    (statement.matches === null ? 0 : 1) +
    (statement.goals === null ? 0 : 1) +
    (statement.endYear === null ? 0 : 1)
  )
}

function rankWeight(statement: CareerStatement): number {
  return statement.rank === 'preferred' ? 1 : 0
}

/**
 * The order of a parcours, applied before the rows are written.
 *
 * It is the same rule as `comparePlayerClubs` in the domain, minus the id
 * tie-break that only exists once the rows have one: `(start year, end year)`,
 * an open spell last among those starting the same year. The database does not
 * depend on this order — every screen sorts what it reads — but a report and a
 * log line are read by a human.
 */
function byCareerOrder(a: ExtractedPassage, b: ExtractedPassage): number {
  return (
    a.startYear - b.startYear ||
    (a.endYear ?? Number.POSITIVE_INFINITY) - (b.endYear ?? Number.POSITIVE_INFINITY) ||
    compareStrings(a.statementId, b.statementId)
  )
}

function anomaliesOf(passage: ExtractedPassage): PassageAnomaly[] {
  const { clubQid, startYear, endYear, matches, goals } = passage
  const anomalies: PassageAnomaly[] = []
  const flag = (reason: PassageAnomaly['reason']) =>
    anomalies.push({ clubQid, startYear, reason })

  // 2 989 passages in the source score more than they play.
  if (matches !== null && goals !== null && goals > matches) flag('goals-above-matches')
  if (endYear !== null && endYear < startYear) flag('ends-before-start')
  if (startYear < EARLIEST_PLAUSIBLE_YEAR) flag('starts-before-1880')

  return anomalies
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
