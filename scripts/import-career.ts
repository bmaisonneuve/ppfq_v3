/**
 * Imports the senior career of one or more footballers, then exits.
 * `pnpm ingest:career Q1835 Q170328`.
 *
 * The hand trigger the ticket asks for, and it depends on no worker: the
 * service is called in a straight line, because a footballer is two SPARQL
 * queries waiting on I/O (docs/stack-technique.md §7). The back-office button
 * (#4, #5) will call the same function; this is the same act from a terminal,
 * which is what makes the pipeline usable before there is an admin screen.
 *
 * An adapter, like a Server Action or a worker task: read the arguments, call
 * the service, print what happened. Every rule it prints lives in the service.
 *
 * ## Two oddities, both deliberate
 *
 * `--conditions=react-server` in the package script: the service is under
 * `src/server/` and carries `import 'server-only'`, whose marker package
 * resolves to an empty module under that condition. Without it a plain Node
 * process refuses the import — which is the whole point of the marker, and the
 * same thing `vitest.config.ts` arranges with an alias.
 *
 * The service is imported *dynamically*, after `loadEnvLocal()`. Static imports
 * are hoisted and evaluated first, so this is what guarantees `.env.local` is
 * read before anything under `src/server/` runs. Nothing there reads the
 * environment on evaluation today — `db/client.ts` opens its pool on the first
 * query, not on import — and keeping the order explicit is what makes that a
 * detail rather than the difference between a working script and one that dies
 * on a missing DATABASE_URL while the file sat right there.
 */
import { loadEnvLocal } from './db.ts'

loadEnvLocal()

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

const qids = process.argv.slice(2)
if (qids.length === 0) {
  console.error(
    [
      'Usage: pnpm ingest:career <Wikidata id> [<Wikidata id>…]',
      '',
      '  pnpm ingest:career Q1835              Zinedine Zidane',
      '  pnpm ingest:career Q1835 Q170328      several, one run each',
      '',
      'The footballer must exist on Wikidata; he need not exist in the catalogue.',
    ].join('\n'),
  )
  process.exit(2)
}

const { importFootballerCareer } = await import('../src/server/services/ingest.service.ts')
const { pool } = await import('../src/server/db/client.ts')

type Report = Awaited<ReturnType<typeof importFootballerCareer>>

let failed = 0

try {
  for (const qid of qids) {
    // One footballer at a time, each in its own run and its own `job_runs`
    // row, and a failure does not stop the list: importing ten footballers and
    // losing the lot because the third id was mistyped is not what the admin
    // asked for.
    try {
      console.log(describe(await importFootballerCareer({ qid })))
    } catch (error) {
      failed += 1
      console.error(`✗ ${qid}  ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  // The application's pool is a long-lived singleton; a script has to close it
  // or the process hangs on an idle connection.
  await pool.end()
}

if (failed > 0) process.exit(1)

/**
 * The parcours as it was written, then what was left out.
 *
 * Printing the clubs is the point of running this by hand: a reserve team
 * wearing senior clothes and a hole where a club should be are both visible in
 * this list and in nothing else. No query can find either.
 */
function describe(report: Report): string {
  const lines = [
    `✓ ${report.qid}  ${report.name}${report.footballerCreated ? ' (created)' : ''}`,
  ]

  for (const passage of report.passages) {
    lines.push(
      [
        `  ${String(passage.startYear)}-${passage.endYear === null ? '····' : String(passage.endYear)}`,
        (passage.clubFrName ?? passage.clubEnName ?? passage.clubQid).padEnd(32),
        passage.isLoan ? 'loan ' : '     ',
        `${count(passage.matches)} matches`,
        `${count(passage.goals)} goals`,
      ].join(' '),
    )
  }

  const skipped = Object.entries(report.skipped)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${reason}`)

  lines.push(
    `  ${report.passagesWritten} passages, ${report.clubsCreated} clubs created` +
      `, nationality ${report.nationality?.code ?? `none (${report.nationalityRefusal ?? '—'})`}`,
  )
  if (skipped.length > 0) lines.push(`  skipped: ${skipped.join(', ')}`)
  for (const anomaly of report.anomalies) {
    lines.push(`  ⚠ ${anomaly.clubQid} ${anomaly.startYear}: ${anomaly.reason}`)
  }
  lines.push(`  run ${report.jobRunId}`)

  return lines.join('\n')
}

/** A missing count is a hole in a hint, so it prints as one. */
function count(value: number | null): string {
  return (value === null ? '—' : String(value)).padStart(4)
}
