import 'server-only'

import { createHash } from 'node:crypto'

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { clubCrests, clubs } from '@/server/db/schema'
import { fetchWikipediaImage, fetchWikipediaJson } from '@/server/ingest/wikipedia'
import type { FetchOptions, ImageFetcher, JsonFetcher } from '@/server/ingest/wikipedia'
import { findClubCrests } from '@/server/ingest/wikipedia-crest'
import type { CrestSource } from '@/server/ingest/wikipedia-crest'
import { ALLOWED_CREST_TYPES, MAX_CREST_BYTES } from '@/shared/club'

import { ClubNotFoundError } from './club.service'
import { CLUB_CREST_JOB, finishJobRun, startJobRun } from './job-runs.service'

/**
 * The blason: storing the bytes, serving them, and going to fetch them.
 *
 * ## Addressed by its content
 *
 * The key of a crest **is** the SHA-256 of its bytes. Three things follow, and
 * they are the whole design (ADR-0010):
 *
 * - two clubs with the same crest share one row;
 * - storing the same image twice is a no-op, so a re-run costs nothing;
 * - replacing a club's crest moves it to a *different* key, therefore a
 *   different URL, so the read path may be cached for ever and there is
 *   nothing to invalidate.
 *
 * A replaced crest leaves its old row behind, and that is deliberate: it is a
 * few tens of kilobytes, another club may point at it, and the row is exactly
 * what a takedown deletes. Nothing here garbage-collects.
 *
 * ## Extraction never replaces
 *
 * A crest that is already there is curated data, and ADR-0005's rule applies
 * unchanged: the import fills what is missing and overwrites nothing an admin
 * touched. It is not a check in a loop — the query itself only ever selects
 * clubs with no crest, and the update carries the same condition, so two passes
 * running at once cannot walk over each other either.
 *
 * ## A failure is counted, never propagated into an import
 *
 * A half-written parcours is a false enigma; a missing crest is a missing
 * image. So every extraction opens its own `job_runs` row and a download that
 * fails lands there, never on the career import that asked for it.
 */

/** Raised when bytes are offered that this service will not store. */
export class InvalidCrestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCrestError'
  }
}

/** Bytes on their way in, and everything that has to travel with them. */
export type NewCrest = {
  bytes: Uint8Array
  contentType: string
  /** The Wikipedia file, or the name of the file an admin uploaded. */
  sourceFile: string | null
  sourceUrl: string | null
  /** `fr`, `en`, or null for a hand upload. */
  sourceWiki: string | null
  license: string | null
}

/** Bytes on their way out, as the read path serves them. */
export type StoredCrest = {
  key: string
  bytes: Buffer
  contentType: string
  byteSize: number
}

/**
 * The bytes behind a content address.
 *
 * Deliberately not admin-only: this is the read path, it is served publicly and
 * cached indefinitely behind the CDN, and the address is a SHA-256 — there is
 * nothing to enumerate.
 */
export async function readCrest(key: string): Promise<StoredCrest | null> {
  const [row] = await db
    .select({
      key: clubCrests.key,
      bytes: clubCrests.bytes,
      contentType: clubCrests.contentType,
      byteSize: clubCrests.byteSize,
    })
    .from(clubCrests)
    .where(eq(clubCrests.key, key))
    .limit(1)

  return row ?? null
}

/**
 * Puts a crest on a club, replacing whatever was there.
 *
 * This is the hand upload, and the only thing in the codebase that overwrites a
 * crest: the admin looking at a 1894 team photograph where a crest should be is
 * the reason the screen exists, and he must be able to correct it more than
 * once.
 *
 * Returns the new key, which is also the new URL: the old one keeps serving the
 * old bytes to whatever cached it, and nothing has to be purged.
 */
export async function setClubCrest(clubId: string, crest: NewCrest): Promise<string> {
  const key = await storeCrest(crest)

  const [updated] = await db
    .update(clubs)
    .set({ crestKey: key })
    .where(eq(clubs.id, clubId))
    .returning({ id: clubs.id })

  if (!updated) throw new ClubNotFoundError(clubId)
  return key
}

/** Takes a club's crest off, leaving the bytes in place for whoever else points at them. */
export async function clearClubCrest(clubId: string): Promise<void> {
  const [updated] = await db
    .update(clubs)
    .set({ crestKey: null })
    .where(eq(clubs.id, clubId))
    .returning({ id: clubs.id })

  if (!updated) throw new ClubNotFoundError(clubId)
}

/**
 * Writes the bytes and answers their address.
 *
 * `onConflictDoNothing` on the primary key is the whole idempotence: the same
 * image offered twice is the same row, whichever club offered it.
 */
async function storeCrest(crest: NewCrest): Promise<string> {
  assertStorable(crest)
  const bytes = Buffer.from(crest.bytes)
  const key = createHash('sha256').update(bytes).digest('hex')

  await db
    .insert(clubCrests)
    .values({
      key,
      bytes,
      contentType: crest.contentType,
      byteSize: bytes.byteLength,
      sourceFile: crest.sourceFile,
      sourceUrl: crest.sourceUrl,
      sourceWiki: crest.sourceWiki,
      license: crest.license,
    })
    .onConflictDoNothing({ target: clubCrests.key })

  return key
}

/**
 * What will and will not be stored — and the refusal that matters is the type.
 *
 * Raster only. An SVG is executable markup and this one would be served from
 * the site's own origin; the extraction never produces one anyway, because a
 * thumbnail asked of the Wikimedia thumbnailer comes back rendered as PNG.
 */
function assertStorable(crest: NewCrest): void {
  if (!ALLOWED_CREST_TYPES.includes(crest.contentType)) {
    throw new InvalidCrestError(
      `${crest.contentType} is not an image this service stores ` +
        `(${ALLOWED_CREST_TYPES.join(', ')}).`,
    )
  }
  if (crest.bytes.byteLength === 0) throw new InvalidCrestError('The image is empty.')
  if (crest.bytes.byteLength > MAX_CREST_BYTES) {
    throw new InvalidCrestError(
      `The image is ${crest.bytes.byteLength} bytes, over the ${MAX_CREST_BYTES} allowed.`,
    )
  }
}

export type CrestExtractionInput = {
  /** Restrict the pass to these clubs. Absent: every club with no crest. */
  clubIds?: readonly string[]
  /**
   * How long the pass may keep starting new downloads. Absent: as long as it
   * takes, which is what the catch-up command wants.
   *
   * It exists for the other caller. A career import runs inside the admin's own
   * POST, and a footballer can create a dozen clubs: without a budget, one slow
   * or unreachable article multiplies by twelve and the admin watches a
   * successful import look like a hung one. The budget does not interrupt a
   * download in flight — that is the HTTP timeout's job — it stops starting new
   * ones, and the clubs left over are counted as skipped and picked up by the
   * next pass.
   */
  budgetMs?: number
  /** Timeouts and retries for the calls this pass makes. */
  fetchOptions?: FetchOptions
  /** The endpoints, injectable: the suite replays recorded answers. */
  fetchJson?: JsonFetcher
  fetchImage?: ImageFetcher
}

export type CrestExtractionReport = {
  jobRunId: string
  /** Clubs looked at: no crest yet, and a Wikidata id to look them up by. */
  scanned: number
  /** Crests written. */
  fetched: number
  /** Clubs the source has no image for. Three quarters coverage, not a failure. */
  missing: number
  /**
   * Clubs the pass did not settle: the budget ran out before their turn, or the
   * crest arrived and the club had gained one meanwhile. Distinct from
   * `missing`, which is a fact about the source and would be a lie here — and
   * the next pass picks them up either way.
   */
  skipped: number
  /** Downloads or reads that went wrong. Counted, never thrown at the caller. */
  errors: number
  lastError: string | null
}

/**
 * Fetches the crests of the clubs that have none, in one pass.
 *
 * The same call serves both callers the ticket asks for: the career import
 * hands it the clubs it just created, and the catch-up command hands it
 * nothing at all and walks the whole catalogue.
 *
 * It never throws. Everything it could not do is in the report and in the
 * `job_runs` row — because both callers are in the same position, an import
 * that must not fail over an image and a command that must not stop on the
 * first club whose article moved.
 *
 * Downloads run one at a time. The pass has nobody waiting on it, and a free
 * service run by a foundation is not somewhere to open thirty connections.
 */
export async function extractClubCrests(
  input: CrestExtractionInput = {},
): Promise<CrestExtractionReport> {
  const jobRunId = await startJobRun({
    job: CLUB_CREST_JOB,
    // One club is a run about that club; a pass is about no one in particular.
    target: input.clubIds?.length === 1 ? (input.clubIds[0] ?? null) : null,
  })

  const report = await runExtraction(input, jobRunId)
  await finishJobRun(jobRunId, {
    items: report.fetched,
    errors: report.errors,
    lastError: report.lastError,
  })

  return report
}

async function runExtraction(
  input: CrestExtractionInput,
  jobRunId: string,
): Promise<CrestExtractionReport> {
  const candidates = await clubsWithoutCrest(input.clubIds)
  const report: CrestExtractionReport = {
    jobRunId,
    scanned: candidates.length,
    fetched: 0,
    missing: 0,
    skipped: 0,
    errors: 0,
    lastError: null,
  }
  if (candidates.length === 0) return report

  const options = input.fetchOptions
  const fetchJson = input.fetchJson ?? (async (url) => await fetchWikipediaJson(url, options))
  const fetchImage = input.fetchImage ?? (async (url) => await fetchWikipediaImage(url, options))
  const deadline = input.budgetMs === undefined ? null : Date.now() + input.budgetMs

  let sources: Map<string, CrestSource>
  try {
    sources = await findClubCrests(
      candidates.map((club) => club.wikidataQid),
      fetchJson,
    )
  } catch (error) {
    // The source itself is unreachable: no club was looked at, and saying so
    // once beats reporting every club as its own failure.
    return { ...report, errors: 1, lastError: reasonOf(error) }
  }

  for (const club of candidates) {
    const source = sources.get(club.wikidataQid)
    // No article, or an article with no main image. Three quarters coverage
    // doing its job, and not a failure.
    if (source === undefined) {
      report.missing += 1
      continue
    }

    record(report, source, await settle(club.id, source, fetchImage, deadline))
  }

  return report
}

/**
 * One club's turn: the download, unless the budget is already spent.
 *
 * The budget is checked here rather than around the loop because it bounds the
 * *multiplication* — a footballer's dozen new clubs, one slow article each —
 * and not any single download, which is the HTTP timeout's job.
 */
async function settle(
  clubId: string,
  source: CrestSource,
  fetchImage: ImageFetcher,
  deadline: number | null,
): Promise<DownloadOutcome> {
  if (deadline !== null && Date.now() > deadline) return 'kept'
  return await downloadOnto(clubId, source, fetchImage)
}

/** The one place a tally moves. */
function record(
  report: CrestExtractionReport,
  source: CrestSource,
  outcome: DownloadOutcome,
): void {
  if (outcome === 'fetched') report.fetched += 1
  else if (outcome === 'kept') report.skipped += 1
  else {
    report.errors += 1
    report.lastError = `${source.qid}: ${outcome.error}`
  }
}

/** What one club's turn came to. `kept` is "it had a crest by the time we got there". */
type DownloadOutcome = 'fetched' | 'kept' | { error: string }

/** One club's crest, from a URL to a row — and never at the cost of the pass. */
async function downloadOnto(
  clubId: string,
  source: CrestSource,
  fetchImage: ImageFetcher,
): Promise<DownloadOutcome> {
  try {
    const image = await fetchImage(source.thumbnailUrl)
    const key = await storeCrest({
      bytes: image.bytes,
      contentType: image.contentType,
      sourceFile: source.fileName,
      sourceUrl: source.thumbnailUrl,
      sourceWiki: source.wiki,
      license: source.license,
    })

    // `crest_key IS NULL` again, and not because the select already said so:
    // between the two, an admin may have uploaded one by hand, and his upload
    // wins. Extraction fills holes and overwrites nothing.
    const [updated] = await db
      .update(clubs)
      .set({ crestKey: key })
      .where(and(eq(clubs.id, clubId), isNull(clubs.crestKey)))
      .returning({ id: clubs.id })

    return updated ? 'fetched' : 'kept'
  } catch (error) {
    return { error: reasonOf(error) }
  }
}

/**
 * The clubs a pass may touch: no crest, and a Wikidata id to find an article
 * by. A club created by hand has no id and is the admin's to upload for.
 */
async function clubsWithoutCrest(
  clubIds: readonly string[] | undefined,
): Promise<{ id: string; wikidataQid: string }[]> {
  const rows = await db
    .select({ id: clubs.id, wikidataQid: clubs.wikidataQid })
    .from(clubs)
    .where(
      and(
        isNull(clubs.crestKey),
        isNotNull(clubs.wikidataQid),
        clubIds === undefined ? undefined : inArray(clubs.id, [...clubIds]),
      ),
    )

  // The select filtered on `wikidata_qid IS NOT NULL`, so every row has one;
  // the column is nullable all the same, and narrowing beats asserting.
  return rows.flatMap((row) =>
    row.wikidataQid === null ? [] : [{ id: row.id, wikidataQid: row.wikidataQid }],
  )
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
