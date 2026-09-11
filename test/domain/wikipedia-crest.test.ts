import { describe, expect, it } from 'vitest'

import {
  CREST_THUMBNAIL_SIZE,
  findClubCrests,
  licensesUrl,
  pageImagesUrl,
  readLicenses,
  readPageImages,
  readSitelinks,
  sitelinksUrl,
} from '@/server/ingest/wikipedia-crest'
import { RECORDED_CLUBS, RECORDED_CLUB_QIDS, recordedWikipedia } from '@test/fixtures/wikipedia'

/**
 * The crest extraction, against what Wikimedia really answered.
 *
 * The pure seam: the network is a recorded fixture, and what is under test is
 * the one decision this module makes — **which** image is a club's crest, and
 * from which edition. Every rule asserted here is a measurement from the
 * ticket, so a test that goes red is either the source having moved (refresh
 * the fixture and read the diff) or the rule having been broken.
 */
describe('finding a club crest', () => {
  it('takes the main image of the French article', async () => {
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    const crest = crests.get(RECORDED_CLUBS.manchesterUnited)
    expect(crest?.wiki).toBe('fr')
    expect(crest?.article).toBe('Manchester United Football Club')
    expect(crest?.fileName).toBe('Logo_Manchester_United_FC.svg')
  })

  it('finds the clubs Wikidata cannot declare', async () => {
    // The four `P154` misses the ticket names are the whole reason this does
    // not go through Wikidata: those files are hosted locally on fr.wikipedia
    // under a trademark licence, so Wikidata cannot carry them at all.
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    for (const qid of [RECORDED_CLUBS.manchesterUnited, RECORDED_CLUBS.psg, RECORDED_CLUBS.realMadrid]) {
      expect(crests.get(qid)?.wiki).toBe('fr')
    }
  })

  it('asks the thumbnailer for a rendered thumbnail, never the original', async () => {
    // Manchester United's crest is a 1,7 MB SVG. What comes back is a PNG the
    // Wikimedia thumbnailer rendered, which is what settles format and size
    // without a single image processing dependency.
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    const url = crests.get(RECORDED_CLUBS.manchesterUnited)?.thumbnailUrl ?? ''
    expect(url).toContain('/thumb/')
    expect(url).toMatch(/\.png(\?|$)/)
  })

  it('keeps the licence next to the crest, so a takedown is one row', async () => {
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    expect(crests.get(RECORDED_CLUBS.manchesterUnited)?.license).toBe('marque déposée')
  })

  it('falls back to en.wikipedia only when fr has nothing', async () => {
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    // London Caledonians has no French article at all.
    expect(crests.get(RECORDED_CLUBS.londonCaledonians)?.wiki).toBe('en')
    // And nothing that fr answered for was taken from en.
    for (const qid of [RECORDED_CLUBS.manchesterUnited, RECORDED_CLUBS.psg, RECORDED_CLUBS.realMadrid]) {
      expect(crests.get(qid)?.wiki).not.toBe('en')
    }
  })

  it('records the source file, because the main image is not always a crest', async () => {
    // The measured case, and the reason the fiche shows this name: the English
    // article of London Caledonians answers a labelled team photograph from
    // 1894. Nothing here can tell it from a crest, so nothing here tries.
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    expect(crests.get(RECORDED_CLUBS.londonCaledonians)?.fileName).toBe(
      'Labeled_group_photo_of_London_Caledonians_F.C._in_1894.png',
    )
  })

  it('answers nothing for an article that has no main image', async () => {
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    // A French article exists; it simply carries no image, and neither does an
    // English one. "No crest" is not a failure — 75 % is the measured coverage.
    expect(crests.has(RECORDED_CLUBS.bockenheimer)).toBe(false)
  })

  it('answers nothing for a club no edition has an article for', async () => {
    const crests = await findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia())

    expect(crests.has(RECORDED_CLUBS.schmalkalden)).toBe(false)
  })

  it('asks for nothing at all when given no club', async () => {
    const crests = await findClubCrests([], async (url) => {
      await Promise.resolve()
      throw new Error(`Should not have asked for ${url}.`)
    })

    expect(crests.size).toBe(0)
  })

  it('lets a failed request through, so the caller counts it', async () => {
    // The extraction never swallows an outage into "this club has no crest":
    // an empty answer and an unreachable endpoint are different facts, and the
    // trace in `job_runs` is where the difference has to land.
    await expect(
      findClubCrests(RECORDED_CLUB_QIDS, recordedWikipedia({ fail: true })),
    ).rejects.toThrow(/unreachable/)
  })
})

describe('the requests it builds', () => {
  it('asks Wikidata for both editions in one call', () => {
    const url = sitelinksUrl(['Q18656', 'Q8682'])

    expect(url).toContain('action=wbgetentities')
    expect(url).toContain('props=sitelinks')
    expect(url).toContain(encodeURIComponent('frwiki|enwiki'))
    expect(url).toContain(encodeURIComponent('Q18656|Q8682'))
  })

  it('asks each edition for a thumbnail at the one width', () => {
    const url = pageImagesUrl('fr', ['Manchester United Football Club'])

    expect(url).toContain('https://fr.wikipedia.org/w/api.php')
    expect(url).toContain('prop=pageimages')
    expect(url).toContain(`pithumbsize=${CREST_THUMBNAIL_SIZE}`)
    expect(url).toContain(encodeURIComponent('thumbnail|name'))
  })

  it('asks for the licence in the file namespace of the edition it came from', () => {
    const url = licensesUrl('en', ['Logo_X.svg'])

    expect(url).toContain('https://en.wikipedia.org/w/api.php')
    expect(url).toContain('iiextmetadatafilter=LicenseShortName')
    expect(url).toContain(encodeURIComponent('File:Logo_X.svg'))
  })

  it('uses formatversion 2 everywhere, so `pages` is a list', () => {
    for (const url of [sitelinksUrl(['Q1']), pageImagesUrl('fr', ['A']), licensesUrl('fr', ['B'])]) {
      expect(url).toContain('formatversion=2')
    }
  })
})

describe('reading what the API answers', () => {
  it('keeps only the editions an item actually has', () => {
    const titles = readSitelinks({
      entities: {
        Q1: { sitelinks: { frwiki: { title: 'Un club' }, enwiki: { title: 'A club' } } },
        Q2: { sitelinks: { enwiki: { title: 'Only English' } } },
        Q3: { sitelinks: {} },
      },
    })

    expect(titles.get('Q1')).toEqual({ fr: 'Un club', en: 'A club' })
    expect(titles.get('Q2')).toEqual({ en: 'Only English' })
    expect(titles.has('Q3')).toBe(false)
  })

  it('drops a page image the renderer could not make a thumbnail of', () => {
    const images = readPageImages({
      query: {
        pages: [
          { title: 'With', pageimage: 'A.svg', thumbnail: { source: 'https://x/a.png' } },
          { title: 'Without', pageimage: 'B.svg' },
          { title: 'Nothing' },
        ],
      },
    })

    expect(images.get('With')).toEqual({ fileName: 'A.svg', thumbnailUrl: 'https://x/a.png' })
    expect(images.has('Without')).toBe(false)
    expect(images.has('Nothing')).toBe(false)
  })

  it('reads a title with underscores as the same title with spaces', () => {
    // MediaWiki treats the two as one character, and the sitelink and the
    // answer do not always agree on which it used.
    const images = readPageImages({
      query: {
        pages: [{ title: 'A_B', pageimage: 'C.svg', thumbnail: { source: 'https://x/c.png' } }],
      },
    })

    expect(images.has('A B')).toBe(true)
  })

  it('matches a licence across the translated file namespace', () => {
    // The request says `File:…` and fr.wikipedia answers `Fichier:…`, so the
    // namespace is exactly the part that cannot be matched on.
    const licenses = readLicenses({
      query: {
        pages: [
          {
            title: 'Fichier:Logo Manchester United FC.svg',
            imageinfo: [{ extmetadata: { LicenseShortName: { value: 'marque déposée' } } }],
          },
        ],
      },
    })

    expect(licenses.get('Logo_Manchester_United_FC.svg')).toBeUndefined()
    expect(licenses.get('Logo Manchester United FC.svg')).toBe('marque déposée')
  })

  it('strips the markup an extmetadata value carries', () => {
    const licenses = readLicenses({
      query: {
        pages: [
          {
            title: 'File:A.svg',
            imageinfo: [{ extmetadata: { LicenseShortName: { value: '<p>Public domain</p>' } } }],
          },
        ],
      },
    })

    expect(licenses.get('A.svg')).toBe('Public domain')
  })

  it('reads an answer that is not what the API promises as no answer at all', () => {
    // The endpoint is a third party. A payload it never should have sent must
    // read as "nothing found", never as `[object Object]` reaching a column.
    expect(readSitelinks(null).size).toBe(0)
    expect(readPageImages({ query: { pages: 'not a list' } }).size).toBe(0)
    expect(readLicenses({}).size).toBe(0)
  })
})
