import { createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clubCrests, clubs, jobRuns } from '@/server/db/schema'
import { getClubDossier } from '@/server/services/club.service'
import {
  InvalidCrestError,
  clearClubCrest,
  extractClubCrests,
  readCrest,
  setClubCrest,
} from '@/server/services/crest.service'
import { CLUB_CREST_JOB } from '@/server/services/job-runs.service'

import { db } from '@test/setup/db'
import { CLUB_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { ONE_PIXEL_PNG, OTHER_PNG, fakeWikipedia } from '@test/fixtures/crest'

/**
 * The blason seam: storing the bytes, serving them, and going to fetch them,
 * against a real Postgres.
 *
 * Two rules carry almost everything here, and both come from the ticket:
 * **the key is the content**, so the same image is one row and a replacement is
 * a new URL; and **extraction never replaces**, because a crest that is there
 * is curated data (ADR-0005's rule, applied unchanged).
 *
 * The source is a fake that answers what each test says it answers. The
 * *reading* of what Wikimedia really sends is the other seam's job, in
 * `test/domain/wikipedia-crest.test.ts`, against recorded payloads.
 */

const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const handUpload = {
  bytes: ONE_PIXEL_PNG,
  contentType: 'image/png',
  sourceFile: 'blason.png',
  sourceUrl: null,
  sourceWiki: null,
  license: null,
}

describe('setClubCrest', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('addresses a crest by the hash of its bytes', async () => {
    const key = await setClubCrest(CLUB_IDS.juventus, handUpload)

    expect(key).toBe(sha256(ONE_PIXEL_PNG))
  })

  it('stores the same image once, however many clubs point at it', async () => {
    const first = await setClubCrest(CLUB_IDS.juventus, handUpload)
    const second = await setClubCrest(CLUB_IDS.rennes, handUpload)

    expect(second).toBe(first)
    expect(await db.select().from(clubCrests)).toHaveLength(1)
  })

  it('changes the URL when the crest is replaced, which is what makes it cacheable', async () => {
    const before = await setClubCrest(CLUB_IDS.juventus, handUpload)
    const after = await setClubCrest(CLUB_IDS.juventus, { ...handUpload, bytes: OTHER_PNG })

    expect(after).not.toBe(before)
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest?.key).toBe(after)
    // And the old address still answers the old bytes: nothing is invalidated,
    // which is the whole reason the read path may say `immutable`.
    expect((await readCrest(before))?.bytes.equals(ONE_PIXEL_PNG)).toBe(true)
  })

  it('keeps the source and the licence with the bytes, so a takedown is one row', async () => {
    await setClubCrest(CLUB_IDS.juventus, {
      ...handUpload,
      sourceFile: 'Logo_Juventus.svg',
      sourceUrl: 'https://thumb.wikimedia.org/x.png',
      sourceWiki: 'fr',
      license: 'marque déposée',
    })

    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toMatchObject({
      sourceFile: 'Logo_Juventus.svg',
      sourceWiki: 'fr',
      license: 'marque déposée',
    })
  })

  it('refuses an SVG, which would be executable markup on our own origin', async () => {
    await expect(
      setClubCrest(CLUB_IDS.juventus, { ...handUpload, contentType: 'image/svg+xml' }),
    ).rejects.toBeInstanceOf(InvalidCrestError)
  })

  it('refuses something that is not an image at all', async () => {
    await expect(
      setClubCrest(CLUB_IDS.juventus, { ...handUpload, contentType: 'text/html' }),
    ).rejects.toBeInstanceOf(InvalidCrestError)
  })

  it('refuses an empty file', async () => {
    await expect(
      setClubCrest(CLUB_IDS.juventus, { ...handUpload, bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(InvalidCrestError)
  })

  it('refuses a club that does not exist', async () => {
    await expect(setClubCrest(UNKNOWN_ID, handUpload)).rejects.toThrow(/No club/)
  })
})

describe('readCrest', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('gives back exactly the bytes that were stored', async () => {
    const key = await setClubCrest(CLUB_IDS.juventus, handUpload)

    const crest = await readCrest(key)
    expect(crest?.bytes.equals(ONE_PIXEL_PNG)).toBe(true)
    expect(crest?.contentType).toBe('image/png')
    expect(crest?.byteSize).toBe(ONE_PIXEL_PNG.byteLength)
  })

  it('answers nothing for an address nothing was ever stored at', async () => {
    expect(await readCrest(sha256(OTHER_PNG))).toBeNull()
  })
})

describe('clearClubCrest', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('takes the crest off the club and leaves the bytes where they are', async () => {
    const key = await setClubCrest(CLUB_IDS.juventus, handUpload)

    await clearClubCrest(CLUB_IDS.juventus)

    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toBeNull()
    expect(await readCrest(key)).not.toBeNull()
  })
})

describe('extractClubCrests', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  /** The source, answering for two of the catalogue's clubs. */
  const source = () =>
    fakeWikipedia({
      // Juventus: a French article, the ordinary case.
      Q1422: {
        wiki: 'fr',
        article: 'Juventus Football Club',
        fileName: 'Logo_Juventus.svg',
        license: 'marque déposée',
        bytes: ONE_PIXEL_PNG,
      },
      // Real Madrid: only an English article, which is the fallback.
      Q8682: {
        wiki: 'en',
        article: 'Real Madrid CF',
        fileName: 'Real_Madrid_CF.svg',
        bytes: OTHER_PNG,
      },
    })

  it('fetches the crest of a club that has none', async () => {
    const wikipedia = source()

    const report = await extractClubCrests({
      clubIds: [CLUB_IDS.juventus],
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report).toMatchObject({ scanned: 1, fetched: 1, missing: 0, skipped: 0, errors: 0 })
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toMatchObject({
      key: sha256(ONE_PIXEL_PNG),
      sourceFile: 'Logo_Juventus.svg',
      sourceWiki: 'fr',
      license: 'marque déposée',
    })
  })

  it('falls back to en.wikipedia when fr has nothing', async () => {
    const wikipedia = source()

    await extractClubCrests({
      clubIds: [CLUB_IDS.realMadrid],
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect((await getClubDossier(CLUB_IDS.realMadrid))?.crest?.sourceWiki).toBe('en')
  })

  it('never replaces a crest that is already there', async () => {
    // The rule of ADR-0005 applied unchanged: an extraction fills holes and
    // never walks over what an admin curated.
    const key = await setClubCrest(CLUB_IDS.juventus, handUpload)
    const wikipedia = source()

    const report = await extractClubCrests({
      clubIds: [CLUB_IDS.juventus],
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report).toMatchObject({ scanned: 0, fetched: 0 })
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest?.key).toBe(key)
    // Nothing was even asked of the source: the query is the guard, not a check.
    expect(wikipedia.requests).toEqual([])
  })

  it('walks the whole catalogue when no club is named', async () => {
    const wikipedia = source()

    const report = await extractClubCrests({
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    // Ten clubs in the fixture, all with a Wikidata id and none with a crest.
    expect(report.scanned).toBe(10)
    expect(report.fetched).toBe(2)
    // The eight the fake source has no article for. Not a failure: 75 % is the
    // measured coverage of fr.wikipedia, and a hole is a hole.
    expect(report.missing).toBe(8)
    expect(report.errors).toBe(0)
  })

  it('skips a club created by hand, which has no article to look in', async () => {
    const wikipedia = source()
    await db.insert(clubs).values({ frName: 'Olympique de Marseille', enName: null })

    const report = await extractClubCrests({
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report.scanned).toBe(10)
  })

  it('counts a failed download and carries on with the rest', async () => {
    const wikipedia = fakeWikipedia({
      Q1422: { wiki: 'fr', article: 'Juventus Football Club', fileName: 'A.svg' },
      Q8682: {
        wiki: 'fr',
        article: 'Real Madrid Club de Fútbol',
        fileName: 'B.svg',
        bytes: ONE_PIXEL_PNG,
      },
    })

    const report = await extractClubCrests({
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report.errors).toBe(1)
    expect(report.lastError).toMatch(/Q1422/)
    // The club whose download worked kept its crest: one failure is one club.
    expect((await getClubDossier(CLUB_IDS.realMadrid))?.crest).not.toBeNull()
  })

  it('counts an unreachable source once, not once per club', async () => {
    const report = await extractClubCrests({
      fetchJson: async () => {
        await Promise.resolve()
        throw new Error('Wikimedia is gone.')
      },
    })

    expect(report).toMatchObject({ scanned: 10, fetched: 0, errors: 1 })
    expect(report.lastError).toMatch(/Wikimedia is gone/)
  })

  it('refuses to store what the source served if it is not a raster image', async () => {
    const wikipedia = fakeWikipedia({
      Q1422: {
        wiki: 'fr',
        article: 'Juventus Football Club',
        fileName: 'A.svg',
        bytes: ONE_PIXEL_PNG,
        contentType: 'image/svg+xml',
      },
    })

    const report = await extractClubCrests({
      clubIds: [CLUB_IDS.juventus],
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report.errors).toBe(1)
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toBeNull()
  })

  it('is a no-op when every club already has its crest', async () => {
    const wikipedia = source()
    await db.update(clubs).set({ crestKey: await setClubCrest(CLUB_IDS.juventus, handUpload) })

    const report = await extractClubCrests({
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report).toMatchObject({ scanned: 0, fetched: 0, missing: 0, skipped: 0, errors: 0 })
  })

  it('can be run again without fetching what it already has', async () => {
    const wikipedia = source()
    const run = async () =>
      await extractClubCrests({
        fetchJson: wikipedia.fetchJson,
        fetchImage: wikipedia.fetchImage,
      })

    await run()
    const second = await run()

    expect(second).toMatchObject({ scanned: 8, fetched: 0 })
  })
})

describe('the trace an extraction leaves', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('writes one row per pass, with what it handled and what went wrong', async () => {
    const wikipedia = fakeWikipedia({
      Q1422: { wiki: 'fr', article: 'Juventus Football Club', fileName: 'A.svg' },
    })

    const report = await extractClubCrests({
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    const rows = await db.select().from(jobRuns).where(eq(jobRuns.job, CLUB_CREST_JOB))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: report.jobRunId, items: 0, errors: 1 })
    expect(rows[0]?.finishedAt).not.toBeNull()
    expect(rows[0]?.lastError).toMatch(/Q1422/)
  })

  it('names the club when the pass is about exactly one', async () => {
    const wikipedia = fakeWikipedia({})

    await extractClubCrests({
      clubIds: [CLUB_IDS.juventus],
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    const [row] = await db.select().from(jobRuns).where(eq(jobRuns.job, CLUB_CREST_JOB))
    expect(row?.target).toBe(CLUB_IDS.juventus)
  })

  it('names nobody when the pass is the whole catalogue', async () => {
    const wikipedia = fakeWikipedia({})

    await extractClubCrests({ fetchJson: wikipedia.fetchJson, fetchImage: wikipedia.fetchImage })

    const [row] = await db.select().from(jobRuns).where(eq(jobRuns.job, CLUB_CREST_JOB))
    expect(row?.target).toBeNull()
  })

  it('leaves a row even when there was nothing to do', async () => {
    // A pass that looked at nothing is still a pass someone ran, and the
    // question "did the backfill run?" has to have an answer.
    await extractClubCrests({ clubIds: [] })

    const rows = await db.select().from(jobRuns).where(eq(jobRuns.job, CLUB_CREST_JOB))
    expect(rows).toHaveLength(1)
  })
})

describe('the budget a pass may be given', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('stops starting downloads once it is spent, and counts what is left', async () => {
    // What bounds a career import: it runs inside the admin's own request, and
    // a footballer can bring a dozen new clubs. A budget of nothing means the
    // first club's turn is already too late.
    const wikipedia = fakeWikipedia({
      Q1422: {
        wiki: 'fr',
        article: 'Juventus Football Club',
        fileName: 'A.svg',
        bytes: ONE_PIXEL_PNG,
      },
    })

    const report = await extractClubCrests({
      budgetMs: -1,
      fetchJson: wikipedia.fetchJson,
      fetchImage: wikipedia.fetchImage,
    })

    expect(report).toMatchObject({ fetched: 0, errors: 0, skipped: 1 })
    // Skipped, not missing: the source *has* an image for it, and the next
    // pass is what picks it up.
    expect(report.missing).toBe(9)
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toBeNull()
  })

  it('picks up on the next pass what a spent budget left behind', async () => {
    const wikipedia = fakeWikipedia({
      Q1422: {
        wiki: 'fr',
        article: 'Juventus Football Club',
        fileName: 'A.svg',
        bytes: ONE_PIXEL_PNG,
      },
    })
    const source = { fetchJson: wikipedia.fetchJson, fetchImage: wikipedia.fetchImage }

    await extractClubCrests({ budgetMs: -1, ...source })
    const second = await extractClubCrests(source)

    expect(second.fetched).toBe(1)
  })

  it('counts a club that gained a crest mid-pass as skipped, not as missing', async () => {
    // The race the guarded UPDATE exists for: an admin uploaded one between the
    // select and the write. "The source has no image" would be the one thing
    // that is not true about it.
    const wikipedia = fakeWikipedia({
      Q1422: {
        wiki: 'fr',
        article: 'Juventus Football Club',
        fileName: 'A.svg',
        bytes: ONE_PIXEL_PNG,
      },
    })

    const report = await extractClubCrests({
      clubIds: [CLUB_IDS.juventus],
      fetchJson: wikipedia.fetchJson,
      fetchImage: async (url) => {
        // Someone uploads while the download is in flight.
        await setClubCrest(CLUB_IDS.juventus, handUpload)
        return await wikipedia.fetchImage(url)
      },
    })

    expect(report).toMatchObject({ scanned: 1, fetched: 0, missing: 0, skipped: 1 })
    // And the hand upload is what stayed: curated data wins.
    expect((await getClubDossier(CLUB_IDS.juventus))?.crest?.sourceWiki).toBeNull()
  })
})
