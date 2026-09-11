import 'server-only'

import { asc, count, eq, ilike, inArray, or } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { clubCrests, clubs, playerClubs } from '@/server/db/schema'
import { MIN_CLUB_QUERY_LENGTH } from '@/shared/club'
import type {
  ClubDossier,
  ClubNames,
  ClubOption,
  CrestRunTrace,
  MergeClubsInput,
  NewClubInput,
} from '@/shared/club'

import { CLUB_CREST_JOB, findLastJobRun, jobRunFailed } from './job-runs.service'

/**
 * The club as a thing of its own: found, created, renamed, merged.
 *
 * A club is **shared**. Renaming one renames it under every footballer who
 * played there, and merging two moves everyone's passages at once — which is
 * why this is its own service and not a corner of curation, where everything
 * concerns one footballer.
 *
 * ## Why the fiche exists at all
 *
 * `clubs` was write-once: the career import inserted rows and nothing in the
 * codebase ever updated one. The code itself announced two holes as reparable
 * without repairing either:
 *
 * - a club the source names in **no** language is stored under its Wikidata id,
 *   so a parcours shows `Q123456` — "visibly wrong and trivially fixable", and
 *   there was nothing to fix it with;
 * - creating a club by hand documents that "the day the source knows this club,
 *   the import creates a *second* row rather than adopting this one — a
 *   duplicate the admin can see and merge", and there was no merge.
 *
 * `renameClub` and `mergeClubs` are those two sentences, made true.
 */

export class ClubNotFoundError extends Error {
  constructor(readonly clubId: string) {
    super(`No club ${clubId} in the catalogue. Create it before using it.`)
    this.name = 'ClubNotFoundError'
  }
}

/** Raised when a merge would have nothing to merge into, or nothing to merge. */
export class ClubMergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClubMergeError'
  }
}

/**
 * The club picker behind "add a passage", and the club search of the fiche.
 *
 * A plain substring match on both names, ordered by the French one so the list
 * does not move under the cursor between two keystrokes. It is not the player
 * typeahead and does not pretend to be: no normalised terms, no trigram rescue,
 * no notoriety — the catalogue holds a few thousand clubs, one admin uses this,
 * and `clubs` has no term column to index. The English name is searched because
 * the model keeps it precisely as the admin's fallback.
 *
 * The two-character floor is the typeahead's, for the same reason: below it the
 * answer is noise.
 */
export async function searchClubs(query: string): Promise<ClubOption[]> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_CLUB_QUERY_LENGTH) return []

  // `%`, `_` and `\` would otherwise be wildcards in the admin's own query.
  const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)
  const pattern = `%${escaped}%`

  return await db
    .select({ id: clubs.id, frName: clubs.frName, enName: clubs.enName })
    .from(clubs)
    .where(or(ilike(clubs.frName, pattern), ilike(clubs.enName, pattern)))
    .orderBy(asc(clubs.frName), asc(clubs.id))
    .limit(CLUB_SUGGESTION_LIMIT)
}

const CLUB_SUGGESTION_LIMIT = 20

/**
 * Creates a club the source does not have, so a hand-typed passage has
 * something to point at.
 *
 * `wikidata_qid` stays null, which is the model's own marker for a row entered
 * by hand. Two such clubs never collide: Postgres does not consider two nulls
 * equal in a unique index. The day the source does know this club, the import
 * creates a *second* row rather than adopting this one — a deliberate
 * consequence of matching clubs on their Wikidata id, where a silent adoption
 * would rename a club under every footballer at once. `mergeClubs` is the other
 * half of that decision.
 */
export async function createClub(input: NewClubInput): Promise<ClubOption> {
  const [created] = await db
    .insert(clubs)
    .values({ frName: input.frName, enName: input.enName })
    .returning({ id: clubs.id, frName: clubs.frName, enName: clubs.enName })

  return created as ClubOption
}

/** Everything the club's fiche shows, read from the catalogue on every call. */
export async function getClubDossier(clubId: string): Promise<ClubDossier | null> {
  const [row] = await db
    .select({ club: clubs, crest: clubCrests })
    .from(clubs)
    .leftJoin(clubCrests, eq(clubCrests.key, clubs.crestKey))
    .where(eq(clubs.id, clubId))
    .limit(1)

  if (!row) return null

  const [passages] = await db
    .select({ value: count() })
    .from(playerClubs)
    .where(eq(playerClubs.clubId, clubId))

  const { club, crest } = row

  return {
    id: club.id,
    frName: club.frName,
    enName: club.enName,
    wikidataQid: club.wikidataQid,
    crest:
      crest === null
        ? null
        : {
            key: crest.key,
            byteSize: crest.byteSize,
            sourceFile: crest.sourceFile,
            sourceUrl: crest.sourceUrl,
            sourceWiki: crest.sourceWiki,
            license: crest.license,
          },
    passageCount: passages?.value ?? 0,
    lastCrestRun: await readLastCrestRun(clubId),
  }
}

/**
 * The last crest extraction that ran for this club.
 *
 * Read by club id because that is what a one-club run records as its target —
 * a whole-catalogue pass is about nobody in particular and records null, so it
 * never surfaces here. That is the right answer: this line is about *this*
 * club, and the pass's own tally belongs to the command that ran it.
 */
async function readLastCrestRun(clubId: string): Promise<CrestRunTrace | null> {
  const run = await findLastJobRun({ job: CLUB_CREST_JOB, target: clubId })
  if (run === null) return null

  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    fetched: run.items,
    failed: jobRunFailed(run),
    lastError: run.lastError,
  }
}

/**
 * Corrects a club's names — the French one the game displays, and the English
 * one the admin searches and reads reserve-team markers in.
 *
 * The case that made this necessary: a club Wikidata names in no language is
 * inserted under its Q-id, and until now the row could never be renamed. The
 * English name may be cleared, because "we do not know it" is a fact and the
 * empty string is not; the French one may not, because it is what the game
 * shows and a club has to be called something.
 */
export async function renameClub(clubId: string, names: ClubNames): Promise<void> {
  const [updated] = await db
    .update(clubs)
    .set({ frName: names.frName, enName: names.enName })
    .where(eq(clubs.id, clubId))
    .returning({ id: clubs.id })

  if (!updated) throw new ClubNotFoundError(clubId)
}

export type ClubMergeReport = {
  keepId: string
  /** Passages moved off the duplicate. None is a legitimate answer. */
  passagesMoved: number
  /** What the surviving club took from the duplicate because it had none. */
  adopted: { wikidataQid: boolean; enName: boolean; crestKey: boolean }
}

/**
 * Merges a duplicate into the club that survives.
 *
 * **No passage is lost**: every `player_clubs` row pointing at the duplicate is
 * moved onto the surviving club before the duplicate is deleted, and the whole
 * thing is one transaction — a half-merged pair would leave a footballer with a
 * club that no longer exists, which the foreign key would refuse anyway.
 *
 * The surviving club **adopts what it does not have**: the Wikidata id, the
 * English name, the crest. That is the point rather than a nicety. The
 * duplicate exists because the admin typed a club in by hand and the import
 * later met the real one; if the survivor kept no Q-id, the next import would
 * create the duplicate all over again. Nothing already filled in is touched —
 * the survivor is the curated row, and this must not undo curation.
 *
 * Both rows are locked, in id order, so two merges racing over the same pair
 * cannot each move the other's passages onto a row the other is deleting.
 */
export async function mergeClubs(input: MergeClubsInput): Promise<ClubMergeReport> {
  if (input.keepId === input.mergedId) {
    throw new ClubMergeError('A club cannot be merged into itself.')
  }

  return await db.transaction(async (tx) => {
    const held = await tx
      .select()
      .from(clubs)
      .where(inArray(clubs.id, [input.keepId, input.mergedId]))
      .orderBy(asc(clubs.id))
      .for('update')

    const keep = held.find((club) => club.id === input.keepId)
    const merged = held.find((club) => club.id === input.mergedId)
    if (keep === undefined) throw new ClubNotFoundError(input.keepId)
    if (merged === undefined) throw new ClubNotFoundError(input.mergedId)

    const moved = await tx
      .update(playerClubs)
      .set({ clubId: keep.id })
      .where(eq(playerClubs.clubId, merged.id))
      .returning({ id: playerClubs.id })

    // Deleted *before* the survivor adopts its Wikidata id: that column is
    // unique, and the two rows would carry the same one for an instant.
    await tx.delete(clubs).where(eq(clubs.id, merged.id))

    const adopted = {
      wikidataQid: keep.wikidataQid === null && merged.wikidataQid !== null,
      enName: keep.enName === null && merged.enName !== null,
      crestKey: keep.crestKey === null && merged.crestKey !== null,
    }
    if (adopted.wikidataQid || adopted.enName || adopted.crestKey) {
      await tx
        .update(clubs)
        .set({
          wikidataQid: keep.wikidataQid ?? merged.wikidataQid,
          enName: keep.enName ?? merged.enName,
          crestKey: keep.crestKey ?? merged.crestKey,
        })
        .where(eq(clubs.id, keep.id))
    }

    return { keepId: keep.id, passagesMoved: moved.length, adopted }
  })
}

/** The check every writer of a passage makes before pointing one at a club. */
export async function assertClubExists(clubId: string): Promise<void> {
  const [row] = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1)

  if (!row) throw new ClubNotFoundError(clubId)
}
