import 'server-only'

import { asc, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { clubs, footballers, nationalities, playerClubs } from '@/server/db/schema'
import { flagPassages } from '@/server/domain/curation'
import type { Nationality } from '@/shared/career'
import type { CurationDossier, CurationImportTrace, PassageInput } from '@/shared/curation'

import { assertClubExists } from './club.service'
import { CAREER_IMPORT_JOB, findLastJobRun, jobRunFailed } from './job-runs.service'

/**
 * Curation: the screen the admin uses every day, as a service.
 *
 * He searches a footballer, sees what the import produced, and corrects what
 * the source gives wrong or not at all. That last part is the whole reason the
 * screen exists — a parcours can be **complete and false by omission**, no
 * query detects it, and the only guard is the admin's eye against the Wikipedia
 * page (`docs/modele-donnees.md` §4).
 *
 * ## What is deliberately absent
 *
 * - **No verification status.** No `verified_at`, no "curated" boolean: "curé"
 *   stays the fact of having passages. Nothing here writes a state about the
 *   state of the data.
 * - **No ordering.** `player_clubs` has no ordering column, so there is no
 *   reorder operation and there can be no drag & drop: correcting an order is
 *   `updatePassage` with a different year.
 * - **No automatic deletion.** The reserve-team flag is a label heuristic that
 *   is measurably wrong sometimes, so nothing in this module removes a passage
 *   without being told to.
 *
 * ## Where the admin check is
 *
 * Not here. It is `requireAdmin()` in `admin-auth.service.ts`, called by every
 * admin page and every admin Server Action, and enforced by
 * `test/architecture/admin-guard.test.ts`. Putting it in this module would
 * bring `next/headers` into the one seam the suite calls directly, and would
 * still not protect the pages — a Next 16 layout does not control whether its
 * child segments render.
 */

export class FootballerNotFoundError extends Error {
  constructor(readonly footballerId: string) {
    super(`No footballer ${footballerId} in the referential.`)
    this.name = 'FootballerNotFoundError'
  }
}

export class PassageNotFoundError extends Error {
  constructor(readonly passageId: string) {
    super(`No passage ${passageId}. It may have been deleted in another tab.`)
    this.name = 'PassageNotFoundError'
  }
}

/**
 * Everything the curation screen shows for one footballer, read from the
 * catalogue on every call.
 *
 * Returns `null` only when the footballer is not in the referential at all. A
 * footballer with no passages is a dossier to open, not a missing one: that is
 * precisely the state curation starts from.
 */
export async function getCurationDossier(
  footballerId: string,
): Promise<CurationDossier | null> {
  const [row] = await db
    .select({ footballer: footballers, nationality: nationalities })
    .from(footballers)
    .leftJoin(nationalities, eq(nationalities.id, footballers.nationalityId))
    .where(eq(footballers.id, footballerId))
    .limit(1)

  if (!row) return null

  const passages = await db
    .select({
      id: playerClubs.id,
      clubId: playerClubs.clubId,
      clubName: clubs.frName,
      // Not decoration: the reserve-team signal was measured on English labels,
      // and a French name can have lost the marker the English one carries.
      clubEnName: clubs.enName,
      // The crest, shown next to the club so a 1894 team photograph where a
      // crest should be is caught on the screen the admin already has open.
      crestKey: clubs.crestKey,
      isLoan: playerClubs.isLoan,
      startYear: playerClubs.startYear,
      endYear: playerClubs.endYear,
      matches: playerClubs.matches,
      goals: playerClubs.goals,
    })
    .from(playerClubs)
    .innerJoin(clubs, eq(clubs.id, playerClubs.clubId))
    .where(eq(playerClubs.footballerId, footballerId))

  const { footballer, nationality } = row

  return {
    footballerId: footballer.id,
    name: footballer.name,
    wikidataQid: footballer.wikidataQid,
    wikiFrUrl: footballer.wikiFrUrl,
    wikiEnUrl: footballer.wikiEnUrl,
    nationality: nationality === null ? null : toNationality(nationality),
    passages: flagPassages(passages),
    lastImport: await readLastImport(footballer.wikidataQid),
  }
}

/**
 * The last career import of this footballer, as the screen shows it.
 *
 * Read by `wikidata_qid` because that is what the run recorded: `job_runs` is
 * written outside the transaction it describes, so it holds the id the caller
 * asked for and not a foreign key that a rollback could have left dangling. A
 * footballer entered by hand has no id and therefore no trace, which is also
 * why there is no import button for him.
 */
async function readLastImport(qid: string | null): Promise<CurationImportTrace | null> {
  if (qid === null) return null

  const run = await findLastJobRun({ job: CAREER_IMPORT_JOB, target: qid })
  if (run === null) return null

  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    passagesWritten: run.items,
    failed: jobRunFailed(run),
    lastError: run.lastError,
  }
}

/**
 * Adds a passage the source did not have.
 *
 * The flagship case, and the reason the screen is not read-only: Cantona's
 * Marseille years are simply absent from Wikidata, which leaves his three loans
 * attached to nothing and a hole nobody can see. Typing the missing club in is
 * the only repair there is.
 *
 * Both foreign keys are checked before the insert so the caller gets a sentence
 * rather than a constraint violation — the club especially, since it is picked
 * from a search and may have been deleted meanwhile.
 */
export async function addPassage(
  footballerId: string,
  input: PassageInput,
): Promise<string> {
  await assertFootballerExists(footballerId)
  await assertClubExists(input.clubId)

  const [inserted] = await db
    .insert(playerClubs)
    .values({ footballerId, ...input })
    .returning({ id: playerClubs.id })

  return (inserted as { id: string }).id
}

/**
 * Rewrites a passage whole: its club, its years, its loan annotation, its
 * league matches and goals.
 *
 * Whole rather than field by field because the form submits the row it shows,
 * and because two of the four corrections the admin makes — the loan flag and
 * the year that fixes an order — are indistinguishable from "leave it alone" in
 * a partial update.
 *
 * The footballer is not a parameter and cannot change: moving a passage from
 * one footballer to another is not a correction, it is two edits.
 */
export async function updatePassage(passageId: string, input: PassageInput): Promise<void> {
  await assertClubExists(input.clubId)

  const [updated] = await db
    .update(playerClubs)
    .set(input)
    .where(eq(playerClubs.id, passageId))
    .returning({ id: playerClubs.id })

  if (!updated) throw new PassageNotFoundError(passageId)
}

/**
 * Removes a passage — the reserve team the admin decided was one, or a spell
 * the source invented.
 *
 * This is the *only* way a passage disappears outside an import. Nothing
 * deletes on the strength of the reserve heuristic, which is measurably wrong
 * often enough that an automatic sweep would quietly drop real senior spells.
 *
 * The club stays in the catalogue: it is shared with every other footballer who
 * played there.
 */
export async function deletePassage(passageId: string): Promise<void> {
  const [deleted] = await db
    .delete(playerClubs)
    .where(eq(playerClubs.id, passageId))
    .returning({ id: playerClubs.id })

  if (!deleted) throw new PassageNotFoundError(passageId)
}

/**
 * Assigns the one sporting nationality, or clears it.
 *
 * One, even for a dual national: hint 3 falls in the middle of a game, and a
 * wrong flag is a false enigma while a missing one only makes the footballer
 * unschedulable.
 *
 * Clearing is allowed here and nowhere else. An import never unsets a
 * nationality — that is what makes a hand-made correction survive the next run
 * — but the admin who typed the wrong one has to be able to take it back.
 */
export async function setFootballerNationality(
  footballerId: string,
  nationalityId: string | null,
): Promise<void> {
  const [updated] = await db
    .update(footballers)
    .set({ nationalityId, updatedAt: new Date() })
    .where(eq(footballers.id, footballerId))
    .returning({ id: footballers.id })

  if (!updated) throw new FootballerNotFoundError(footballerId)
}

/** What the nationality picker offers: every row there is, in French order. */
export async function listNationalities(): Promise<Nationality[]> {
  const rows = await db.select().from(nationalities).orderBy(asc(nationalities.frName))

  return rows.map(toNationality)
}

async function assertFootballerExists(footballerId: string): Promise<void> {
  const [row] = await db
    .select({ id: footballers.id })
    .from(footballers)
    .where(eq(footballers.id, footballerId))
    .limit(1)

  if (!row) throw new FootballerNotFoundError(footballerId)
}

function toNationality(row: typeof nationalities.$inferSelect): Nationality {
  return {
    id: row.id,
    code: row.code,
    frName: row.frName,
    flagKey: row.flagKey,
  }
}
