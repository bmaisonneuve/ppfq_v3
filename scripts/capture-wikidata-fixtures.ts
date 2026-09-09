/**
 * Records the Wikidata answers the career import is tested against, then exits.
 * Run with `pnpm fixtures:wikidata`.
 *
 * The suite never touches the network: it replays the files this script writes
 * (`test/fixtures/wikidata/<qid>.json`). Recording them rather than writing
 * them by hand is the point — a payload invented from the documentation would
 * only ever prove that the pipeline agrees with what we believed. These are the
 * real thing, `"28.0"` decimals and missing French labels included.
 *
 * The queries come from `src/server/ingest/wikidata-career.ts`, so re-running
 * this cannot produce a fixture the source would not have asked for. What it
 * *can* produce is a different answer: Wikidata moves, and QLever is a snapshot
 * of it. The seven items below were captured on 2026-09-09 and the tests assert
 * what they contained on that day, so a refresh is a change to read, not a
 * chore to run. `git diff` on the fixtures is the review.
 *
 * `--conditions=react-server` in the package script is what lets a plain Node
 * process import files marked `server-only`: the marker package resolves to an
 * empty module under that condition. `vitest.config.ts` does the same by alias.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { careerQuery, identityQuery } from '../src/server/ingest/wikidata-career.ts'
import { runSparqlQuery } from '../src/server/ingest/sparql.ts'

/** Each one is here for a shape the pipeline has to handle. */
const ITEMS: Record<string, string> = {
  Q1835: 'Zinedine Zidane — four clubs, five selections, nothing missing',
  Q615: 'Lionel Messi — two untyped reserve teams, a transfer that is not a loan, no fr/en label',
  Q170328: 'Eric Cantona — three loans, and Marseille 1988-1991 absent from the source',
  Q39444: 'Ronaldinho — a 2026 spell at S.C. Ravenna he never played, and a selection with no dates',
  Q102035: 'A footballer of median notoriety — half his passages carry no statistics',
  Q10520: 'David Beckham — England for sport, United Kingdom for citizenship',
  Q42816: "Corte de' Frati — an Italian commune, and one of the ids the brief called a footballer",
}

const OUTPUT_DIR = join('test', 'fixtures', 'wikidata')

await mkdir(OUTPUT_DIR, { recursive: true })

for (const [qid, what] of Object.entries(ITEMS)) {
  process.stderr.write(`  … ${qid} — ${what}\n`)

  // Sequentially, one item at a time: the endpoint is a free service and this
  // script has nobody waiting on it.
  const identity = await runSparqlQuery(identityQuery(qid))
  const career = await runSparqlQuery(careerQuery(qid))

  const path = join(OUTPUT_DIR, `${qid}.json`)
  await writeFile(
    path,
    `${JSON.stringify({ qid, what, capturedAt: new Date().toISOString().slice(0, 10), identity, career }, null, 2)}\n`,
    'utf8',
  )
  process.stderr.write(`    ${identity.length} identity rows, ${career.length} statement rows\n`)
}

console.log(`Captured ${Object.keys(ITEMS).length} items into ${OUTPUT_DIR}.`)
