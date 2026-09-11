import 'server-only'

import { MAX_CREST_BYTES } from '@/shared/club'

import {
  MAX_ATTEMPTS,
  RETRYABLE_STATUSES,
  RETRY_BASE_DELAY_MS,
  WIKIMEDIA_USER_AGENT,
  sleepFor,
} from './wikimedia'

/**
 * The Wikimedia gateway: two functions, one that sends an API query and gives
 * back its JSON, one that downloads an image.
 *
 * It knows about HTTP, timeouts, retries and what an acceptable image is, and
 * nothing about football or crests. What a crest *is*, and which article to ask
 * for it, lives in `wikipedia-crest.ts`; this file is the only thing here that
 * touches the network, so it is also the only thing a test has to replace —
 * exactly the arrangement `sparql.ts` has with the Wikidata pipeline.
 *
 * ## Why the MediaWiki API and not Wikidata
 *
 * Measured, and the whole reason the extraction is shaped this way: only 2 172
 * of 46 361 clubs carry `P154` on Wikidata (4,7 %), and the missing ones
 * include Real Madrid, the PSG, Manchester United and Tottenham. That is
 * structural rather than an oversight — those files are hosted **locally** on
 * fr.wikipedia under a trademark licence, never on Commons, so Wikidata cannot
 * declare them. The article's own main image is what has them: 224 of 299
 * sampled clubs with a French article, 75 %.
 */

/** The API answers in well under a second; this is the "network is gone" ceiling. */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * A ceiling on what will be read off the wire, and the reason `original` is
 * never asked for: the SVG behind Manchester United's crest is 1,7 MB, while
 * the thumbnail of it the API hands back is ~50 kB.
 *
 * It is the ceiling a hand upload has to clear too (`shared/club.ts`), because
 * an image the store would refuse is not worth reading off the wire first, and
 * two ceilings drifting apart is a download that succeeds and a write that
 * cannot.
 */
const MAX_IMAGE_BYTES = MAX_CREST_BYTES

/** Raised when Wikimedia could not be reached, refused, or answered nonsense. */
export class WikipediaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WikipediaError'
  }
}

/** The seam for the API. A test hands over recorded payloads. */
export type JsonFetcher = (url: string) => Promise<unknown>

/** The seam for the bytes. A test hands over an image it made up. */
export type ImageFetcher = (url: string) => Promise<DownloadedImage>

export type DownloadedImage = {
  bytes: Uint8Array
  /** The served type, lower-cased and stripped of its parameters. */
  contentType: string
}

export type FetchOptions = {
  timeoutMs?: number
  maxAttempts?: number
  /** Overridden in tests so a retry does not really wait. */
  sleep?: (ms: number) => Promise<void>
}

/** Sends one API request and returns the parsed body. */
export async function fetchWikipediaJson(
  url: string,
  options: FetchOptions = {},
): Promise<unknown> {
  return await withRetries(
    url,
    options,
    async (response) => await (response.json() as Promise<unknown>),
    { Accept: 'application/json' },
  )
}

/**
 * Downloads one image, refusing anything that is not one and anything too big.
 *
 * The type is checked against what was *served* rather than against the URL:
 * the thumbnailer renders an SVG as PNG, so the extension in the path says
 * `.svg.png` and only the header is the truth. The size is checked twice — the
 * advertised length first, so an oversized body is not read at all, then the
 * body itself, because `Content-Length` is optional.
 */
export async function fetchWikipediaImage(
  url: string,
  options: FetchOptions = {},
): Promise<DownloadedImage> {
  return await withRetries(url, options, readImage, { Accept: 'image/*' })
}

async function readImage(response: Response): Promise<DownloadedImage> {
  const served = response.headers.get('content-type') ?? ''
  const contentType = (served.split(';')[0] ?? '').trim().toLowerCase()

  if (!contentType.startsWith('image/')) {
    throw new WikipediaError(
      `Not an image: the server answered ${contentType === '' ? '(no type)' : contentType}.`,
    )
  }

  const advertised = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(advertised) && advertised > MAX_IMAGE_BYTES) {
    throw new WikipediaError(`Image too large: ${advertised} bytes announced.`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new WikipediaError(`Image too large: ${bytes.byteLength} bytes read.`)
  }
  if (bytes.byteLength === 0) throw new WikipediaError('The server answered an empty image.')

  return { bytes, contentType }
}

/** Marks the errors `withRetries` is willing to try again. */
class RetryableWikipediaError extends Error {}

/**
 * One request, up to three attempts, and the reading of the answer left to the
 * caller. The policy itself — the contact string, the attempts, the statuses
 * worth retrying — is `wikimedia.ts`'s, shared with the SPARQL client.
 */
async function withRetries<T>(
  url: string,
  options: FetchOptions,
  read: (response: Response) => Promise<T>,
  headers: Record<string, string>,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const sleep = options.sleep ?? sleepFor

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await read(
        await send(url, headers, options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      )
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt === maxAttempts) break
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  throw new WikipediaError(`${url} did not answer: ${String(lastError)}`, { cause: lastError })
}

async function send(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const response = await fetch(url, {
    headers: { ...headers, 'User-Agent': WIKIMEDIA_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (response.ok) return response

  const message = `${response.status} ${response.statusText}`
  if (RETRYABLE_STATUSES.has(response.status)) throw new RetryableWikipediaError(message)
  throw new WikipediaError(message)
}

function isRetryable(error: unknown): boolean {
  // A network failure or a timeout comes out of `fetch` as a TypeError or an
  // AbortError; both are worth one more try. A `WikipediaError` is a refusal we
  // understood — a 404, a body that is not an image — and trying again is waste.
  return error instanceof RetryableWikipediaError || !(error instanceof WikipediaError)
}
