import { readCrest } from '@/server/services/crest.service'
import { CREST_KEY_PATTERN } from '@/shared/club'

/**
 * The crest read path: a content address in, the bytes out.
 *
 * A Route Handler rather than a Server Action because it needs an HTTP
 * contract — a `GET` at a stable URL that an `<img>` can point at and that
 * Cloudflare can hold on to (`docs/stack-technique.md` §4).
 *
 * ## `immutable`, and why the claim is true
 *
 * The key **is** the SHA-256 of the bytes, so this URL can only ever answer
 * these bytes. Replacing a club's crest writes a different key and therefore a
 * different URL; there is nothing to invalidate, and a cache may keep the old
 * one for as long as it likes. That is what makes storing the bytes in Postgres
 * a non-issue: this is not a hot path, it is a path the origin stops seeing
 * (ADR-0010).
 *
 * ## Public, and not by oversight
 *
 * No `requireAdmin()`. A CDN cannot cache what it has to authenticate, and
 * there is nothing to protect: the address is a SHA-256 of an image taken from
 * a public Wikipedia article, and nothing can be enumerated.
 *
 * ## The three headers that are not decoration
 *
 * `nosniff` and a `Content-Security-Policy` of `default-src 'none'` are what
 * make serving bytes an admin uploaded from the site's own origin safe. The
 * service already refuses anything that is not a raster image, and these are
 * the belt to that brace. `Content-Disposition: inline` keeps a browser from
 * treating an odd type as a download.
 */

/** A year, which is as long as `max-age` goes, plus the real promise. */
const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params

  // A key that is not a SHA-256 cannot name a crest, so it is answered without
  // a query — and never echoed back, because the path is reflected content.
  if (!CREST_KEY_PATTERN.test(key)) {
    return new Response('Not found', { status: 404 })
  }

  const crest = await readCrest(key)
  if (crest === null) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(crest.bytes), {
    headers: {
      'Content-Type': crest.contentType,
      'Content-Length': String(crest.byteSize),
      'Cache-Control': CACHE_CONTROL,
      // The content address doubles as the validator, for free.
      ETag: `"${crest.key}"`,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
