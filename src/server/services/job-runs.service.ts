import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { jobRuns } from '@/server/db/schema'

/**
 * The run trace: what ran, when, how much it handled and whether it failed.
 *
 * Two calls, `startJobRun` then `finishJobRun`, and they are deliberately not
 * wrapped around a transaction: the row must survive the rollback of the work
 * it describes, because a run that failed and left nothing behind is exactly
 * the run worth reading. So it is its own two writes on the pool, and a job
 * that crashes the process leaves a row with no `finished_at` — which reads as
 * "it never came back", the truth.
 *
 * The career import is the first caller. The three periodic jobs (#14) are the
 * next ones, through the `task()` helper, and the diagnostic screen (#11) is
 * what reads it.
 */

/** `job_runs.job` for the career import. One row per footballer imported. */
export const CAREER_IMPORT_JOB = 'career_import'

export type JobRun = {
  id: string
  job: string
  /** What the run was about — a footballer's Wikidata id for an import. */
  target: string | null
  startedAt: Date
  /** Null means the run never reported back. */
  finishedAt: Date | null
  items: number | null
  errors: number | null
  /** What went wrong, in the words the caller got. Null when nothing did. */
  lastError: string | null
}

/** Long enough for a message, short enough that a row stays readable. */
const MAX_LAST_ERROR_LENGTH = 1_000

export async function startJobRun(run: {
  job: string
  target?: string | null
}): Promise<string> {
  const [started] = await db
    .insert(jobRuns)
    .values({ job: run.job, target: run.target ?? null })
    .returning({ id: jobRuns.id })

  // `RETURNING` on a single-row insert either gives the row or has thrown.
  return (started as { id: string }).id
}

export async function finishJobRun(
  id: string,
  outcome: { items: number; errors: number; lastError?: string | null },
): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      finishedAt: new Date(),
      items: outcome.items,
      errors: outcome.errors,
      lastError: outcome.lastError?.slice(0, MAX_LAST_ERROR_LENGTH) ?? null,
    })
    .where(eq(jobRuns.id, id))
}

/**
 * The last run of one job for one subject — the career import of one
 * footballer, in practice.
 *
 * The curation screen reads it to say what the last import did, including when
 * it did nothing: a refused import leaves no mark on the catalogue, so this row
 * is the only place the reason survives.
 *
 * It matches on `target` rather than on a foreign key because the trace is
 * written outside the transaction it describes and has to survive its rollback
 * — so it holds the Wikidata id the caller asked for, which may not correspond
 * to any row at all.
 */
export async function findLastJobRun(query: {
  job: string
  target: string
}): Promise<JobRun | null> {
  const [row] = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.job, query.job), eq(jobRuns.target, query.target)))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1)

  return row ?? null
}

/**
 * Whether a run went wrong, from the row alone.
 *
 * Not `errors > 0`: a run with no `finished_at` never reported back, which is
 * the shape a crashed process leaves and is a failure too. The trace is written
 * outside the transaction it describes precisely so that row survives, so
 * reading it as a success would waste the one thing it was kept for.
 */
export function jobRunFailed(run: JobRun): boolean {
  return (run.errors ?? 0) > 0 || run.finishedAt === null
}

/**
 * The most recent runs, newest first — the shape the diagnostic screen reads,
 * and what makes "each run leaves a trace" true through the service door rather
 * than only in the database.
 */
export async function listRecentJobRuns(
  options: { job?: string; limit?: number } = {},
): Promise<JobRun[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 200)

  const query = db.select().from(jobRuns)

  return await (options.job === undefined
    ? query
    : query.where(eq(jobRuns.job, options.job))
  )
    .orderBy(desc(jobRuns.startedAt))
    .limit(limit)
}
