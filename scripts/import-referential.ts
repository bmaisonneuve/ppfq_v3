/**
 * Loads the search referential into DATABASE_URL, then exits. Run with
 * `pnpm db:import-referential`, optionally with paths to the two CSVs.
 *
 * An adapter, like a Server Action: read the arguments, call the importer, print
 * what happened. Re-running it is safe — that is an acceptance criterion of the
 * ticket, not a side effect.
 */
import { loadEnvLocal } from './db.ts'
import { importReferential } from './referential.ts'

loadEnvLocal()

const url = process.env.DATABASE_URL
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

const [footballersCsv = '.data/footballers.csv', aliasesCsv = '.data/footballer_aliases.csv'] =
  process.argv.slice(2)

const started = Date.now()

const report = await importReferential({
  connectionString: url,
  footballersCsv,
  aliasesCsv,
  onProgress: ({ footballers, aliases }) => {
    process.stderr.write(`  staged ${footballers} footballers, ${aliases} aliases\n`)
  },
})

const seconds = ((Date.now() - started) / 1000).toFixed(1)

console.log(
  [
    `Referential imported in ${seconds}s.`,
    `  footballers read    ${report.footballersRead}`,
    `  footballers kept    ${report.footballersKept}`,
    `  homonyms dropped    ${report.homonymsDropped}`,
    `  aliases read        ${report.aliasesRead}`,
    `  search terms        ${report.termsWritten}`,
  ].join('\n'),
)
