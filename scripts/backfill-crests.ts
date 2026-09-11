/**
 * Fetches the crests of every club in the catalogue that has none, in one
 * pass, then exits. `pnpm crests:backfill`.
 *
 * The catch-up the ticket asks for. The career import already fetches the
 * crests of the clubs it creates, so this is for everything that entered the
 * catalogue before there was such a thing — and for the clubs whose article
 * had no image the day they were imported and has one now.
 *
 * An adapter, like a Server Action or a worker task: read the arguments, call
 * the service, print what happened. Every rule it obeys lives in the service —
 * it never replaces a crest, it counts what it could not fetch, and it leaves
 * one `job_runs` row for the pass.
 *
 * Re-running it is safe and nearly free: a club that got its crest is no longer
 * a candidate, and a crest that is byte-for-byte one already stored is the same
 * row. It is also slow on purpose — one download at a time, against a free
 * service run by a foundation.
 *
 * ## Two oddities, both deliberate, and both `scripts/import-career.ts`'s
 *
 * `--conditions=react-server` in the package script: the service is under
 * `src/server/` and carries `import 'server-only'`, whose marker package
 * resolves to an empty module under that condition.
 *
 * The service is imported *dynamically*, after `loadEnvLocal()`. Static imports
 * are hoisted and evaluated first, so this is what guarantees `.env.local` is
 * read before anything under `src/server/` runs.
 */
import { loadEnvLocal } from './db.ts'

loadEnvLocal()

if ((process.env.DATABASE_URL ?? '') === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

if (process.argv.includes('--help')) {
  console.error(
    [
      'Usage: pnpm crests:backfill',
      '',
      'Fetches the crest of every club that has none and carries a Wikidata id,',
      'from fr.wikipedia first and en.wikipedia only as a fallback. It never',
      'replaces a crest that is already there.',
    ].join('\n'),
  )
  process.exit(2)
}

const { extractClubCrests } = await import('../src/server/services/crest.service.ts')
const { pool } = await import('../src/server/db/client.ts')

try {
  const report = await extractClubCrests()

  console.log(
    [
      `${report.scanned} club(s) sans blason`,
      `${report.fetched} récupéré(s)`,
      `${report.missing} sans image chez la source`,
      `${report.skipped} repris par une autre main`,
      `${report.errors} en échec`,
    ].join(', '),
  )
  if (report.lastError !== null) console.error(`  dernière erreur : ${report.lastError}`)
  console.log(`  run ${report.jobRunId}`)

  // A pass that lost a download is a pass to look at, and a shell that reads
  // exit codes has to be able to see it. Nothing was left half-written: the
  // clubs that did get a crest kept it.
  if (report.errors > 0) process.exitCode = 1
} finally {
  // The application's pool is a long-lived singleton; a script has to close it
  // or the process hangs on an idle connection.
  await pool.end()
}
