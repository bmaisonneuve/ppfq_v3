/**
 * Renders a flag for every nationality in DATABASE_URL, then exits. Run with
 * `pnpm db:seed-flags`, and with `--force` to replace the flags that are
 * already there.
 *
 * An adapter, like a Server Action: read the arguments, call the seed, print
 * what happened. Re-running it is safe and, without `--force`, is a no-op —
 * which is what makes it something you can put after a career import without
 * thinking about it.
 */
import { loadEnvLocal } from './db.ts'
import { seedFlags } from './flags.ts'

loadEnvLocal()

const url = process.env.DATABASE_URL
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

const overwrite = process.argv.slice(2).includes('--force')

const started = Date.now()
const report = await seedFlags({ connectionString: url, overwrite })
const seconds = ((Date.now() - started) / 1000).toFixed(1)

console.log(
  [
    `Flags seeded in ${seconds}s${overwrite ? ' (--force)' : ''}.`,
    `  nationalities read  ${report.nationalitiesRead}`,
    `  flags linked        ${report.linked}`,
    `  already had one     ${report.alreadyLinked}`,
    `  images stored       ${report.flagsStored}`,
  ].join('\n'),
)

// The two lists are the point of the run: every country the seed could not
// dress is a footballer an admin still has to finish, and silence here would
// be the report claiming a coverage it does not have.
if (report.missing.length > 0) {
  console.log(`\n  no source file for ${report.missing.length}: ${report.missing.join(', ')}`)
  console.log('  add scripts/flags/<code>.svg for each, then run again.')
}

if (report.oversized.length > 0) {
  console.log(`\n  rendered too large, not stored: ${report.oversized.join(', ')}`)
}
