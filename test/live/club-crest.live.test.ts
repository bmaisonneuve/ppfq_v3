import { describe, expect, it } from 'vitest'

import { clubs } from '@/server/db/schema'
import { findClubCrests } from '@/server/ingest/wikipedia-crest'
import { fetchWikipediaImage } from '@/server/ingest/wikipedia'
import { getClubDossier } from '@/server/services/club.service'
import { extractClubCrests } from '@/server/services/crest.service'

import { db, onlyRow } from '@test/setup/db'
import { RECORDED_CLUBS } from '@test/fixtures/wikipedia'

/**
 * The live half of the crest extraction: the real Wikimedia APIs, a real
 * Postgres.
 *
 * `pnpm test:live`. Not part of `pnpm test`, which stays offline and
 * deterministic. What this one is for is exactly what the recordings in
 * `test/fixtures/wikipedia/` cannot check — the same split ADR-0005 sets up for
 * the Wikidata pipeline: that the API parameters are still the ones MediaWiki
 * accepts, that both editions still answer, and that what they answer still has
 * the shape the reader expects.
 *
 * The assertions are **invariants, not figures**. A club changes its crest, a
 * file gets renamed, an article is retitled; a test that pinned any of those
 * would fail for a reason nobody cares about. What must hold whatever the
 * source says today: fr.wikipedia has a main image for Manchester United,
 * en.wikipedia is the fallback and not the first choice, and what comes back is
 * a rendered thumbnail small enough to store.
 */
const LIVE_TIMEOUT = 60_000

describe('the MediaWiki API answers the extraction’s own requests', () => {
  it(
    'finds the crest of a club Wikidata cannot declare',
    async () => {
      // Manchester United carries no `P154`: the file is hosted locally on
      // fr.wikipedia under a trademark licence, which is the whole reason this
      // pipeline exists rather than a Wikidata query.
      const crests = await findClubCrests([RECORDED_CLUBS.manchesterUnited])

      const crest = crests.get(RECORDED_CLUBS.manchesterUnited)
      expect(crest?.wiki).toBe('fr')
      expect(crest?.thumbnailUrl).toContain('/thumb/')
      expect(crest?.fileName).not.toBe('')
    },
    LIVE_TIMEOUT,
  )

  it(
    'falls back to en.wikipedia for a club fr has no article for',
    async () => {
      const crests = await findClubCrests([RECORDED_CLUBS.londonCaledonians])

      expect(crests.get(RECORDED_CLUBS.londonCaledonians)?.wiki).toBe('en')
    },
    LIVE_TIMEOUT,
  )

  it(
    'answers nothing, and not an error, for a club no edition has',
    async () => {
      const crests = await findClubCrests([RECORDED_CLUBS.schmalkalden])

      expect(crests.size).toBe(0)
    },
    LIVE_TIMEOUT,
  )

  it(
    'downloads a thumbnail the renderer produced, not the original',
    async () => {
      const crests = await findClubCrests([RECORDED_CLUBS.manchesterUnited])
      const url = crests.get(RECORDED_CLUBS.manchesterUnited)?.thumbnailUrl ?? ''

      const image = await fetchWikipediaImage(url)

      // The source file is a 1,7 MB SVG; asked for at a width, the Wikimedia
      // thumbnailer renders it as a raster the store will accept.
      expect(image.contentType).toMatch(/^image\/(png|jpeg)$/)
      expect(image.bytes.byteLength).toBeGreaterThan(0)
      expect(image.bytes.byteLength).toBeLessThan(500_000)
    },
    LIVE_TIMEOUT,
  )
})

describe('a real extraction, end to end', () => {
  it(
    'puts a crest on a club of the catalogue and leaves its trace',
    async () => {
      const club = onlyRow(
        await db
          .insert(clubs)
          .values({
            wikidataQid: RECORDED_CLUBS.manchesterUnited,
            frName: 'Manchester United',
            enName: 'Manchester United F.C.',
          })
          .returning({ id: clubs.id }),
      )

      const report = await extractClubCrests({ clubIds: [club.id] })

      expect(report).toMatchObject({ scanned: 1, fetched: 1, errors: 0 })

      const dossier = await getClubDossier(club.id)
      expect(dossier?.crest?.sourceWiki).toBe('fr')
      expect(dossier?.crest?.byteSize).toBeGreaterThan(0)
      // The licence is what makes a takedown one row to delete, and the whole
      // point of asking for it live is that the field is still there.
      expect(dossier?.crest?.license).not.toBeNull()
      expect(dossier?.lastCrestRun?.fetched).toBe(1)
    },
    LIVE_TIMEOUT,
  )

  it(
    'refuses to touch a crest a second pass finds already there',
    async () => {
      const club = onlyRow(
        await db
          .insert(clubs)
          .values({ wikidataQid: RECORDED_CLUBS.psg, frName: 'Paris Saint-Germain' })
          .returning({ id: clubs.id }),
      )

      await extractClubCrests({ clubIds: [club.id] })
      const before = (await getClubDossier(club.id))?.crest?.key

      const second = await extractClubCrests({ clubIds: [club.id] })

      expect(second).toMatchObject({ scanned: 0, fetched: 0 })
      expect((await getClubDossier(club.id))?.crest?.key).toBe(before)
    },
    LIVE_TIMEOUT,
  )
})
