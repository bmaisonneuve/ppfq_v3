/**
 * Records the Wikimedia answers the crest extraction is tested against, then
 * exits. Run with `pnpm fixtures:wikipedia`.
 *
 * The suite never touches the network: it replays the file this script writes
 * (`test/fixtures/wikipedia/clubs.json`). Recording rather than inventing is
 * the point — a payload written from the documentation would only prove that
 * the pipeline agrees with what we believed. These are the real thing, the
 * `Fichier:` namespace and the 1894 team photograph included.
 *
 * It records by **interception**: the fetcher handed to `findClubCrests` is the
 * real one wrapped in a recorder, so the file holds exactly the requests the
 * pipeline makes, in the order it makes them, and no orchestration is written
 * twice. Change which articles are asked for and the fixture changes with it.
 *
 * The clubs below were captured on a day that is written into the file, and the
 * tests assert what they contained that day. A refresh is a change to read —
 * `git diff` on the fixture is the review — not a chore to run.
 *
 * `--conditions=react-server` in the package script is what lets a plain Node
 * process import files marked `server-only`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { findClubCrests } from '../src/server/ingest/wikipedia-crest.ts'
import { fetchWikipediaJson } from '../src/server/ingest/wikipedia.ts'

/** Each one is here for a shape the extraction has to handle. */
const CLUBS: Record<string, string> = {
  Q18656: 'Manchester United — a local fr file, no P154 on Wikidata, « marque déposée »',
  Q483020: 'Paris Saint-Germain — the same, and one of the four Wikidata misses',
  Q8682: 'Real Madrid — the same again',
  Q10319637: 'London Caledonians — en only, and its main image is a team photo from 1894',
  Q161774: '1. Bockenheimer FC 1899 — a French article with no main image at all',
  Q1000185: 'FSV Schmalkalden — no article in either edition. Not an error: three quarters is the coverage',
}

const OUTPUT_DIR = join('test', 'fixtures', 'wikipedia')

const calls: { url: string; payload: unknown }[] = []

const qids = Object.keys(CLUBS)
const crests = await findClubCrests(qids, async (url) => {
  process.stderr.write(`  … ${url}\n`)
  const payload = await fetchWikipediaJson(url)
  calls.push({ url, payload })
  return payload
})

await mkdir(OUTPUT_DIR, { recursive: true })
const path = join(OUTPUT_DIR, 'clubs.json')
await writeFile(
  path,
  `${JSON.stringify(
    { clubs: CLUBS, capturedAt: new Date().toISOString().slice(0, 10), calls },
    null,
    2,
  )}\n`,
  'utf8',
)

for (const qid of qids) {
  const crest = crests.get(qid)
  console.log(
    crest === undefined
      ? `  ${qid}  no crest`
      : `  ${qid}  ${crest.wiki}  ${crest.fileName}  ${crest.license ?? '(no licence)'}`,
  )
}
console.log(`Captured ${calls.length} requests into ${path}.`)
