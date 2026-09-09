import 'server-only'

import { eq, inArray } from 'drizzle-orm'

import { db } from '@/server/db/client'
import type { Db } from '@/server/db/client'
import {
  clubs,
  footballerNames,
  footballers,
  nationalities,
  playerClubs,
} from '@/server/db/schema'
import { readSeniorCareer } from '@/server/ingest/career-statements'
import type {
  ExtractedPassage,
  PassageAnomaly,
  SkippedStatements,
} from '@/server/ingest/career-statements'
import { selectNationality } from '@/server/ingest/nationality'
import type { NationalityRefusal, SelectedNationality } from '@/server/ingest/nationality'
import { runSparqlQuery } from '@/server/ingest/sparql'
import type { SparqlQueryRunner } from '@/server/ingest/sparql'
import { fetchWikidataFootballer } from '@/server/ingest/wikidata-career'
import type { WikidataFootballer } from '@/server/ingest/wikidata-career'
import { nameSearchTerms } from '@/shared/search'

import { CAREER_IMPORT_JOB, finishJobRun, startJobRun } from './job-runs.service'

/**
 * The career import: one footballer, one call, from Wikidata to the catalogue.
 *
 * This is a service and not a script, unlike the referential import (ADR-0004):
 * the admin triggers it from the back-office, footballer by footballer, and it
 * goes through the one door into the server. There is **no ingest job** — a
 * footballer is two SPARQL queries waiting on I/O, which justifies neither a
 * queue nor a worker (docs/stack-technique.md §7).
 *
 * ## It replaces the parcours, and that is the deal
 *
 * The passages of the footballer are deleted and rewritten. So a re-import
 * undoes hand curation: the reserve team an admin removed comes back, because
 * nothing in the source says it is a reserve team. That is not an oversight, it
 * is why the import is a deliberate act on one footballer and never a nightly
 * job — the model accepts a catalogue that moves under a published grid
 * precisely because nothing moves it in silence (`docs/modele-donnees.md` §11).
 *
 * ## What it refuses to write
 *
 * Three refusals, each of them protecting curated data from a thin answer:
 *
 * - an item that is **not a footballer** (`P106`) — three of the four ids in the
 *   original brief were a commune and two Brazilian states;
 * - a career with **no club passage at all**, which would otherwise empty a
 *   curated parcours because the source, or the snapshot, is thin that day;
 * - a footballer **absent from the referential and unnamed** by the source: the
 *   row would be findable by nobody and guessable by nobody.
 *
 * Everything else is written as the source has it. Implausible figures are
 * reported and stored; the model blocks them at scheduling time, not here.
 *
 * ## What it never overwrites
 *
 * `name` and `sitelinks` belong to the referential import. A club's French
 * name, a nationality's French name and both of their images belong to
 * curation: an existing row of `clubs` or `nationalities` is left exactly as it
 * is, and only the missing ones are created. A nationality is set when the
 * source resolves one and never cleared, so an admin's correction — England is
 * the case that needs it — survives the next import.
 */

/** Raised when the Wikidata item is not a footballer. Nothing is written. */
export class NotAFootballerError extends Error {
  constructor(readonly qid: string) {
    super(
      `${qid} is not a footballer on Wikidata (no P106 = Q937857). ` +
        'Check the id: three of the four ids in the original brief pointed at other things.',
    )
    this.name = 'NotAFootballerError'
  }
}

/** Raised when the source knows no senior club spell. Nothing is written. */
export class EmptyCareerError extends Error {
  constructor(
    readonly qid: string,
    readonly skipped: SkippedStatements,
  ) {
    super(
      `${qid} has no senior club passage in Wikidata ` +
        `(skipped: ${JSON.stringify(skipped)}). Nothing was written: an empty ` +
        'parcours is not a career, and a thin answer must not empty a curated one.',
    )
    this.name = 'EmptyCareerError'
  }
}

/** Raised when a footballer would have to be created and the source has no name. */
export class UnnamedFootballerError extends Error {
  constructor(readonly qid: string) {
    super(
      `${qid} is not in the search referential and Wikidata gives no French or ` +
        'English label a search term can be made of. Insert the footballer by hand first.',
    )
    this.name = 'UnnamedFootballerError'
  }
}

export type CareerImportReport = {
  qid: string
  footballerId: string
  name: string
  /** True when the footballer was not in the referential and had to be created. */
  footballerCreated: boolean
  statementsRead: number
  passagesWritten: number
  /**
   * The passages as they were written, in career order. The catalogue holds
   * them too — this is here so a caller can show what landed without a second
   * read, which is how a reserve team or a hole gets noticed.
   */
  passages: ExtractedPassage[]
  /** Clubs the catalogue did not have yet. The rest were left untouched. */
  clubsCreated: number
  /** Set when the source resolved one — and it is never unset. */
  nationality: { code: string; frName: string } | null
  /** Why no nationality was chosen. The footballer is then not schedulable. */
  nationalityRefusal: NationalityRefusal | null
  skipped: SkippedStatements
  /** Kept passages the source contradicts. For the admin's eye, not a rejection. */
  anomalies: PassageAnomaly[]
  /** The `job_runs` row this run left behind. */
  jobRunId: string
}

export type CareerImportInput = {
  /** A Wikidata item id, `Q1835`. Validated before any query is built. */
  qid: string
  /** The endpoint, injectable: the suite replays recorded answers. */
  runQuery?: SparqlQueryRunner
}

/**
 * Imports one footballer's senior career.
 *
 * The trace is opened before the first query and closed whatever happens, so a
 * run that fetched for twenty seconds and then failed is as visible as one that
 * worked. The catalogue itself moves in a single transaction: a half-written
 * parcours is a wrong enigma, not a partial one.
 */
export async function importFootballerCareer(
  input: CareerImportInput,
): Promise<CareerImportReport> {
  const runQuery = input.runQuery ?? ((query: string) => runSparqlQuery(query))
  const jobRunId = await startJobRun({ job: CAREER_IMPORT_JOB, target: input.qid })

  try {
    const report = await importIntoCatalogue(input.qid, runQuery, jobRunId)
    await finishJobRun(jobRunId, { items: report.passagesWritten, errors: 0 })
    return report
  } catch (error) {
    // The reason, and not only the fact: `errors = 1` alone leaves the
    // diagnostic screen with nothing to show, and a refused import — the wrong
    // id, a career with no club — is the run someone comes back to read.
    await finishJobRun(jobRunId, {
      items: 0,
      errors: 1,
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function importIntoCatalogue(
  qid: string,
  runQuery: SparqlQueryRunner,
  jobRunId: string,
): Promise<CareerImportReport> {
  const source = await fetchWikidataFootballer(qid, runQuery)
  if (!source.isFootballer) throw new NotAFootballerError(qid)

  const career = readSeniorCareer(source.statements)
  if (career.passages.length === 0) throw new EmptyCareerError(qid, career.skipped)

  const choice = selectNationality(source.countries)

  return await db.transaction(async (tx) => {
    const nationalityId =
      choice.nationality === null ? null : await upsertNationality(tx, choice.nationality)

    const footballer = await claimFootballer(tx, source, nationalityId)
    const clubIds = await upsertClubs(tx, career.passages)

    await tx.delete(playerClubs).where(eq(playerClubs.footballerId, footballer.id))
    await tx.insert(playerClubs).values(
      career.passages.map((passage) => ({
        footballerId: footballer.id,
        // Every club was just inserted or read back by qid.
        clubId: clubIds.byQid.get(passage.clubQid) as string,
        isLoan: passage.isLoan,
        startYear: passage.startYear,
        endYear: passage.endYear,
        matches: passage.matches,
        goals: passage.goals,
      })),
    )

    return {
      qid,
      footballerId: footballer.id,
      name: footballer.name,
      footballerCreated: footballer.created,
      statementsRead: source.statements.length,
      passagesWritten: career.passages.length,
      passages: career.passages,
      clubsCreated: clubIds.created,
      nationality:
        choice.nationality === null
          ? null
          : { code: choice.nationality.code, frName: choice.nationality.frName },
      nationalityRefusal: choice.refusal,
      skipped: career.skipped,
      anomalies: career.anomalies,
      jobRunId,
    }
  })
}

/** A transaction handle. `db.transaction` hands over the same interface. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Finds the footballer, or creates him, and holds his row for the transaction.
 *
 * The lock is what makes a double-clicked import safe. Without it two runs both
 * delete the parcours, then both insert their own passages — neither sees the
 * other's uncommitted rows — and the footballer ends up with every club twice,
 * which looks exactly like a genuine double spell.
 *
 * Creating him is the manual homonym recovery of `docs/modele-donnees.md` §3:
 * the referential drops 13 042 footballers who share a name with someone more
 * notorious, and importing one by his Wikidata id is how he gets in. He gets
 * his search terms in the same breath — a footballer nobody can type is a
 * footballer nobody can guess.
 */
async function claimFootballer(
  tx: Tx,
  source: WikidataFootballer,
  nationalityId: string | null,
): Promise<{ id: string; name: string; created: boolean }> {
  const held = await lockFootballer(tx, source.qid)

  if (held) {
    await tx
      .update(footballers)
      .set({
        // Filled when missing, never replaced: `name` and `sitelinks` are the
        // referential's, and a hand-corrected nationality must survive.
        wikiFrUrl: held.wikiFrUrl ?? source.wikiFrUrl,
        wikiEnUrl: held.wikiEnUrl ?? source.wikiEnUrl,
        nationalityId: nationalityId ?? held.nationalityId,
        updatedAt: new Date(),
      })
      .where(eq(footballers.id, held.id))

    return { id: held.id, name: held.name, created: false }
  }

  const name = source.frName ?? source.enName
  // No name, or a name that normalises to no term at all — a label of pure
  // punctuation. Both would insert a footballer the typeahead cannot reach, and
  // an essai is a `footballerId` picked from that list: he could never be
  // guessed. Refusing is the honest answer, and an admin can insert him by hand.
  const terms = name === null ? [] : nameSearchTerms(name, true)
  if (name === null || terms.length === 0) throw new UnnamedFootballerError(source.qid)

  const [inserted] = await tx
    .insert(footballers)
    .values({
      wikidataQid: source.qid,
      name,
      wikiFrUrl: source.wikiFrUrl,
      wikiEnUrl: source.wikiEnUrl,
      sitelinks: source.sitelinks ?? 0,
      nationalityId,
    })
    .onConflictDoNothing({ target: footballers.wikidataQid })
    .returning({ id: footballers.id, name: footballers.name })

  if (!inserted) {
    // Lost the race with a concurrent first import of the same footballer. The
    // row exists now, and the lock below serialises the rest.
    const raced = await lockFootballer(tx, source.qid)
    if (!raced) throw new Error(`${source.qid} could neither be read nor inserted.`)
    return { id: raced.id, name: raced.name, created: false }
  }

  await tx
    .insert(footballerNames)
    .values(terms.map((term) => ({ footballerId: inserted.id, ...term })))
    .onConflictDoNothing()

  return { id: inserted.id, name: inserted.name, created: true }
}

async function lockFootballer(tx: Tx, qid: string) {
  const [row] = await tx
    .select()
    .from(footballers)
    .where(eq(footballers.wikidataQid, qid))
    .for('update')
    .limit(1)

  return row
}

/**
 * Creates the clubs the catalogue does not have, and reads back the ids of all
 * of them.
 *
 * An existing club is left alone on purpose: its French name is what the game
 * displays and its crest is curated, so a rename on Wikidata is not allowed to
 * walk over either. The model is explicit that a club renamed beyond
 * recognition is a different row rather than an update.
 *
 * A club the source names in no language is stored under its Wikidata id, so
 * the parcours shows `Q123456` — visibly wrong and trivially fixable, where a
 * blank name would just look broken.
 */
async function upsertClubs(
  tx: Tx,
  passages: readonly ExtractedPassage[],
): Promise<{ byQid: Map<string, string>; created: number }> {
  const wanted = new Map<string, ExtractedPassage>()
  for (const passage of passages) wanted.set(passage.clubQid, passage)

  const inserted = await tx
    .insert(clubs)
    .values(
      [...wanted.values()].map((passage) => ({
        wikidataQid: passage.clubQid,
        frName: passage.clubFrName ?? passage.clubEnName ?? passage.clubQid,
        enName: passage.clubEnName,
      })),
    )
    .onConflictDoNothing({ target: clubs.wikidataQid })
    .returning({ id: clubs.id })

  const rows = await tx
    .select({ id: clubs.id, wikidataQid: clubs.wikidataQid })
    .from(clubs)
    .where(inArray(clubs.wikidataQid, [...wanted.keys()]))

  return {
    byQid: new Map(rows.map((row) => [row.wikidataQid as string, row.id])),
    created: inserted.length,
  }
}

/** Same rule for a nationality: created when unknown, never rewritten. */
async function upsertNationality(
  tx: Tx,
  nationality: SelectedNationality,
): Promise<string> {
  await tx
    .insert(nationalities)
    .values({
      code: nationality.code,
      frName: nationality.frName,
      enName: nationality.enName,
    })
    .onConflictDoNothing({ target: nationalities.code })

  const [row] = await tx
    .select({ id: nationalities.id })
    .from(nationalities)
    .where(eq(nationalities.code, nationality.code))

  return (row as { id: string }).id
}
