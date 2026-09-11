import 'server-only'

import { fetchWikipediaJson } from './wikipedia'
import type { JsonFetcher } from './wikipedia'

/**
 * Finding a club's crest: the three queries that lead from a Wikidata id to a
 * thumbnail URL, and the reading of their answers.
 *
 * The adapter to the source. It knows the API parameters and the shape of the
 * payloads, it writes nothing, and it decides exactly one thing: **which**
 * image is the crest. Storing it is `services/crest.service.ts`'s job.
 *
 * ## Why fr.wikipedia, and why in that order
 *
 * All three numbers are measured (see the ticket, #18):
 *
 * - **Wikidata is unusable.** 2 172 clubs of 46 361 carry `P154` — 4,7 % — and
 *   Real Madrid, the PSG, Manchester United and Tottenham are not among them.
 * - **fr.wikipedia's main article image**: 224 of 299 sampled clubs, 75 % of
 *   those that have a French article at all.
 * - **en.wikipedia is a thin fallback**: 28 of 300, 9 %. The PageImages
 *   extension excludes non-free content on `en`, and club crests are almost all
 *   non-free there.
 *
 * So the order `fr` then `en` is not a preference, it is the measurement: the
 * reverse would lose the four clubs above.
 *
 * ## The thumbnail, never the original
 *
 * `piprop=thumbnail` at a fixed width. Manchester United's crest is a 1,7 MB
 * SVG; asked for at a width, the Wikimedia thumbnailer renders it as PNG. That
 * settles the normalisation of format and size without bringing a single image
 * processing dependency into the project.
 *
 * ## The main image is not always the crest
 *
 * In the English sample, London Caledonians FC answers with a team photograph
 * from 1894. Nothing here can tell the difference, so nothing here tries: the
 * name of the source file travels with the bytes, the club's fiche shows it,
 * and the admin is the correction.
 */

/** The two editions, in the order they are tried. */
export type CrestWiki = 'fr' | 'en'

const WIKIS: readonly CrestWiki[] = ['fr', 'en']

/**
 * The width asked of the thumbnailer.
 *
 * The renderer rounds to its own buckets, so this is a request and not a
 * promise: 128 lands on a ~250 px PNG, measured at ~35 kB on average over the
 * development catalogue — larger than the ~15-20 kB the ticket counted at its
 * own width, and still small enough that the whole catalogue disappears into a
 * Postgres backup. Large enough for any back-office use, which is the only use
 * there is (ADR-0008 keeps crests out of the player's grid).
 */
export const CREST_THUMBNAIL_SIZE = 128

/** How many items one API request carries. The MediaWiki limit for anonymous callers. */
const BATCH_SIZE = 50

/** A crest as the source offers it, before anything is downloaded or stored. */
export type CrestSource = {
  qid: string
  wiki: CrestWiki
  /** The article the image is the main image *of*. */
  article: string
  /** `Logo_Manchester_United_FC.svg` — what makes a wrong pick visible later. */
  fileName: string
  /** The rendered thumbnail. This, and never `original`. */
  thumbnailUrl: string
  /** « marque déposée », for most of them. Null when the source does not say. */
  license: string | null
}

/**
 * The crest of each club that has one, by Wikidata id.
 *
 * Clubs with no French and no English article, and clubs whose article has no
 * main image, are simply absent from the answer: "no crest" is not an error,
 * it is three quarters coverage doing its job.
 *
 * Batched rather than one club at a time, because the whole catalogue goes
 * through here in one pass: a few thousand clubs become a few dozen requests.
 */
export async function findClubCrests(
  qids: readonly string[],
  fetchJson: JsonFetcher = fetchWikipediaJson,
): Promise<Map<string, CrestSource>> {
  const found = new Map<string, CrestSource>()

  for (const batch of chunks(qids, BATCH_SIZE)) {
    const sitelinks = readSitelinks(await fetchJson(sitelinksUrl(batch)))
    // `fr` first, and only the clubs it did not answer for reach `en`.
    for (const wiki of WIKIS) {
      await collectFrom({
        wiki,
        qids: batch.filter((qid) => !found.has(qid)),
        sitelinks,
        fetchJson,
      }, found)
    }
  }

  return found
}

/** One edition's pass: the articles it has, their main images, their licences. */
type EditionPass = {
  wiki: CrestWiki
  qids: readonly string[]
  sitelinks: ReadonlyMap<string, ArticleTitles>
  fetchJson: JsonFetcher
}

async function collectFrom(
  { wiki, qids, sitelinks, fetchJson }: EditionPass,
  into: Map<string, CrestSource>,
): Promise<void> {
  const articles = new Map<string, string>()
  for (const qid of qids) {
    const title = sitelinks.get(qid)?.[wiki]
    if (title !== undefined) articles.set(qid, title)
  }
  if (articles.size === 0) return

  const images = readPageImages(await fetchJson(pageImagesUrl(wiki, [...articles.values()])))
  const licenses = await readLicensesOf(wiki, images, fetchJson)

  for (const [qid, article] of articles) {
    const image = images.get(titleKey(article))
    if (image === undefined) continue
    into.set(qid, {
      qid,
      wiki,
      article,
      fileName: image.fileName,
      thumbnailUrl: image.thumbnailUrl,
      license: licenses.get(fileKey(image.fileName)) ?? null,
    })
  }
}

/**
 * The licence of each file, best effort.
 *
 * Best effort on purpose: the licence is what makes a takedown one row to
 * delete, and it is worth a request — but a crest that arrived without it is
 * still the crest, and failing the extraction over a metadata call would trade
 * the thing asked for against the note about it.
 */
async function readLicensesOf(
  wiki: CrestWiki,
  images: ReadonlyMap<string, PageImage>,
  fetchJson: JsonFetcher,
): Promise<Map<string, string>> {
  const files = [...new Set([...images.values()].map((image) => image.fileName))]
  if (files.length === 0) return new Map()

  try {
    return readLicenses(await fetchJson(licensesUrl(wiki, files)))
  } catch {
    return new Map()
  }
}

/** The French and English article titles of one item, as Wikidata has them. */
export type ArticleTitles = { fr?: string; en?: string }

/** `wbgetentities`, sitelinks only, both editions, up to 50 ids at a time. */
export function sitelinksUrl(qids: readonly string[]): string {
  return wikidataApi({
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: 'sitelinks',
    sitefilter: 'frwiki|enwiki',
  })
}

export function readSitelinks(payload: unknown): Map<string, ArticleTitles> {
  const entities = record(record(payload).entities)
  const titles = new Map<string, ArticleTitles>()

  for (const [qid, entity] of Object.entries(entities)) {
    const sitelinks = record(record(entity).sitelinks)
    const found: ArticleTitles = {}
    const fr = text(record(sitelinks.frwiki).title)
    const en = text(record(sitelinks.enwiki).title)
    if (fr !== null) found.fr = fr
    if (en !== null) found.en = en
    if (fr !== null || en !== null) titles.set(qid, found)
  }

  return titles
}

/** The main image of each article, as a rendered thumbnail. */
export type PageImage = { fileName: string; thumbnailUrl: string }

export function pageImagesUrl(wiki: CrestWiki, titles: readonly string[]): string {
  return wikipediaApi(wiki, {
    action: 'query',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(CREST_THUMBNAIL_SIZE),
    titles: titles.join('|'),
  })
}

/** Keyed by the article title, normalised the way MediaWiki normalises it. */
export function readPageImages(payload: unknown): Map<string, PageImage> {
  const images = new Map<string, PageImage>()

  for (const page of pagesOf(payload)) {
    const title = text(page.title)
    const fileName = text(page.pageimage)
    const thumbnailUrl = text(record(page.thumbnail).source)
    // A page with a `pageimage` but no `thumbnail` is a file the renderer
    // could not produce. There is nothing to download, so there is no crest.
    if (title === null || fileName === null || thumbnailUrl === null) continue
    images.set(titleKey(title), { fileName, thumbnailUrl })
  }

  return images
}

/** `imageinfo` with the one metadata field that matters for a takedown. */
export function licensesUrl(wiki: CrestWiki, fileNames: readonly string[]): string {
  return wikipediaApi(wiki, {
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    iiextmetadatafilter: 'LicenseShortName',
    titles: fileNames.map((name) => `File:${name}`).join('|'),
  })
}

/**
 * Keyed by the file name without its namespace: the request says
 * `File:Logo_Manchester_United_FC.svg` and fr.wikipedia answers
 * `Fichier:Logo Manchester United FC.svg`, so the namespace is exactly the part
 * that cannot be matched on.
 */
export function readLicenses(payload: unknown): Map<string, string> {
  const licenses = new Map<string, string>()

  for (const page of pagesOf(payload)) {
    const title = text(page.title)
    const info = array(page.imageinfo)[0]
    const value = text(record(record(record(info).extmetadata).LicenseShortName).value)
    if (title === null || value === null) continue
    licenses.set(fileKey(title), stripMarkup(value))
  }

  return licenses
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'

function wikidataApi(params: Record<string, string>): string {
  return `${WIKIDATA_API}?${apiQuery(params)}`
}

function wikipediaApi(wiki: CrestWiki, params: Record<string, string>): string {
  return `https://${wiki}.wikipedia.org/w/api.php?${apiQuery(params)}`
}

/**
 * `formatversion=2` on every call, which is what makes `pages` an array rather
 * than an object keyed by page id — and what lets a page that does not exist be
 * read as an entry with nothing in it instead of a magic negative key.
 */
function apiQuery(params: Record<string, string>): string {
  return new URLSearchParams({ ...params, format: 'json', formatversion: '2' }).toString()
}

/** MediaWiki treats `_` and ` ` as the same character in a title. */
function titleKey(title: string): string {
  return title.replace(/_/g, ' ')
}

/** The same, minus the namespace: `Fichier:` on fr, `File:` on en. */
function fileKey(title: string): string {
  const colon = title.indexOf(':')
  return titleKey(colon === -1 ? title : title.slice(colon + 1))
}

/**
 * `extmetadata` values are HTML fragments. The licence is the text in them.
 *
 * A character walk rather than a regular expression: `<[^>]*>` over a value a
 * third party controls is a backtracking risk for a job a `replace` does in one
 * pass, and the shape here — an anchor around a licence name — needs nothing
 * cleverer than "drop everything between the angle brackets".
 */
function stripMarkup(value: string): string {
  let stripped = ''
  let inTag = false
  for (const character of value) {
    if (character === '<') inTag = true
    else if (character === '>') inTag = false
    else if (!inTag) stripped += character
  }
  return stripped.trim()
}

function pagesOf(payload: unknown): Record<string, unknown>[] {
  return array(record(record(payload).query).pages).map(record)
}

/**
 * The three readings of an untrusted payload, in one place.
 *
 * Everything above narrows through these rather than casting: the API is a
 * third party, `pages` is missing when nothing matched, and a value that is not
 * a string is the endpoint breaking its own contract — which must read as "no
 * crest" and never as the string `"[object Object]"` reaching a database.
 */
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Slices a list into requests the API will accept. */
function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}
