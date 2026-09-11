import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { JsonFetcher } from '@/server/ingest/wikipedia'

/**
 * The recorded half of Wikimedia: what the API really answered for six clubs on
 * the day written into the file, and the fake fetcher that replays it.
 *
 * The suite never goes to the network. It does not go to a payload written by
 * hand either: `pnpm fixtures:wikipedia` records by intercepting the very
 * fetcher `findClubCrests` uses, so the file holds exactly the requests the
 * pipeline makes and the tests assert what the source actually contains — the
 * `Fichier:` namespace on fr, « marque déposée », and a team photograph from
 * 1894 where a crest was expected.
 *
 * Refreshing it is a review, not a chore: Wikipedia moves, a club changes its
 * crest, and a `git diff` on this file is the only place that becomes visible.
 */
const RECORDING = join(import.meta.dirname, 'wikipedia', 'clubs.json')

/** The six clubs, by what each one is here to prove. */
export const RECORDED_CLUBS = {
  /** A crest hosted locally on fr, absent from Wikidata's `P154`. */
  manchesterUnited: 'Q18656',
  /** Another of the four `P154` misses the ticket names. */
  psg: 'Q483020',
  realMadrid: 'Q8682',
  /** No French article, and the English one's main image is a team photo. */
  londonCaledonians: 'Q10319637',
  /** A French article with no main image at all — and no English one either. */
  bockenheimer: 'Q161774',
  /** No article in either edition. Not an error: 75 % is the measured coverage. */
  schmalkalden: 'Q1000185',
} as const

/** In the order the recording was made, which is the order the fixture replays. */
export const RECORDED_CLUB_QIDS: readonly string[] = Object.values(RECORDED_CLUBS)

type Recording = {
  clubs: Record<string, string>
  capturedAt: string
  calls: { url: string; payload: unknown }[]
}

function recording(): Recording {
  return JSON.parse(readFileSync(RECORDING, 'utf8')) as Recording
}

export type FetcherOptions = {
  /** Makes every request fail, to test what a failed extraction leaves behind. */
  fail?: boolean
}

/**
 * A fetcher over the recorded requests, keyed by URL.
 *
 * Keyed by URL rather than by call order on purpose: a URL that is not in the
 * recording is a *different question* being asked of the source, and the test
 * that provoked it has to say so out loud rather than quietly receive the
 * answer to the previous one.
 */
export function recordedWikipedia(options: FetcherOptions = {}): JsonFetcher {
  const byUrl = new Map(recording().calls.map((call) => [call.url, call.payload]))

  return async (url: string) => {
    if (options.fail === true) throw new Error(`Wikimedia is unreachable (${url}).`)

    const payload = byUrl.get(url)
    if (payload === undefined) {
      throw new Error(
        `No recorded answer for ${url}. Add the case to ` +
          '`scripts/capture-wikipedia-fixtures.ts` and run `pnpm fixtures:wikipedia`.',
      )
    }
    return await Promise.resolve(payload)
  }
}

/** The day the recording was made, so a test can say what it is asserting about. */
export function recordedOn(): string {
  return recording().capturedAt
}
