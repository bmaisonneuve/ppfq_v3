import type { DownloadedImage, ImageFetcher, JsonFetcher } from '@/server/ingest/wikipedia'

/**
 * A Wikimedia that answers what a test says it answers.
 *
 * Deliberately **not** the recorded fixture of `wikipedia.ts`. That one replays
 * real payloads and is what proves the *reading* is right, at the pure seam
 * where every measured case lives. What a service test needs is something else:
 * a source it can make say "this club has a crest, that one has none, and this
 * download fails" — a fixture of behaviour, not of bytes.
 *
 * It speaks the three requests the pipeline makes, and nothing more. A request
 * it does not recognise throws, so a change in what the pipeline asks for
 * arrives here as a failure rather than as an empty answer.
 */

/** What the fake source knows about one club. */
export type FakeCrest = {
  /** The edition the article is in. `en` is how a fallback is set up. */
  wiki: 'fr' | 'en'
  article: string
  fileName: string
  license?: string
  /** Bytes the download answers. Absent: the download fails. */
  bytes?: Uint8Array
  contentType?: string
}

export type FakeWikipedia = {
  fetchJson: JsonFetcher
  fetchImage: ImageFetcher
  /** Every URL asked for, in order. */
  requests: string[]
}

/** A one-pixel PNG: small, real, and a raster type the service accepts. */
export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** A second, different image, so "the same bytes" can be told from "a crest". */
export const OTHER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export function fakeWikipedia(crests: Record<string, FakeCrest>): FakeWikipedia {
  const requests: string[] = []

  const fetchJson: JsonFetcher = async (url) => {
    requests.push(url)
    const params = new URL(url).searchParams
    const action = params.get('action')
    const prop = params.get('prop')

    if (action === 'wbgetentities') return await Promise.resolve(sitelinks(crests, params))
    if (prop === 'pageimages') return await Promise.resolve(pageImages(crests, url, params))
    if (prop === 'imageinfo') return await Promise.resolve(licenses(crests, params))

    throw new Error(`The fake Wikimedia was asked something it does not know: ${url}`)
  }

  const fetchImage: ImageFetcher = async (url) => {
    requests.push(url)
    const crest = Object.values(crests).find((c) => thumbnailUrl(c) === url)
    if (crest?.bytes === undefined) throw new Error(`The download of ${url} failed.`)
    return await Promise.resolve({
      bytes: crest.bytes,
      contentType: crest.contentType ?? 'image/png',
    } satisfies DownloadedImage)
  }

  return { fetchJson, fetchImage, requests }
}

function thumbnailUrl(crest: FakeCrest): string {
  return `https://thumb.wikimedia.org/${crest.wiki}/${crest.fileName}.png`
}

function sitelinks(
  crests: Record<string, FakeCrest>,
  params: URLSearchParams,
): { entities: Record<string, unknown> } {
  const entities: Record<string, unknown> = {}

  for (const qid of (params.get('ids') ?? '').split('|')) {
    const crest = crests[qid]
    if (crest === undefined) continue
    entities[qid] = {
      sitelinks: { [`${crest.wiki}wiki`]: { title: crest.article } },
    }
  }

  return { entities }
}

function pageImages(
  crests: Record<string, FakeCrest>,
  url: string,
  params: URLSearchParams,
): { query: { pages: unknown[] } } {
  const wiki = url.startsWith('https://fr.') ? 'fr' : 'en'
  const asked = new Set((params.get('titles') ?? '').split('|'))
  const pages = Object.values(crests)
    .filter((crest) => crest.wiki === wiki && asked.has(crest.article))
    .map((crest) => ({
      title: crest.article,
      pageimage: crest.fileName,
      thumbnail: { source: thumbnailUrl(crest) },
    }))

  return { query: { pages } }
}

function licenses(
  crests: Record<string, FakeCrest>,
  params: URLSearchParams,
): { query: { pages: unknown[] } } {
  const asked = new Set((params.get('titles') ?? '').split('|'))
  const pages = Object.values(crests)
    .filter((crest) => asked.has(`File:${crest.fileName}`) && crest.license !== undefined)
    .map((crest) => ({
      title: `File:${crest.fileName}`,
      imageinfo: [{ extmetadata: { LicenseShortName: { value: crest.license } } }],
    }))

  return { query: { pages } }
}
