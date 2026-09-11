import { readFlag } from '@/server/services/flag.service'
import { ALLOWED_FLAG_TYPES, FLAG_KEY_PATTERN } from '@/shared/nationality'

/**
 * Serves one flag, by content address.
 *
 * An adapter, like every door into the server: validate the key, call the
 * service, answer. A Route Handler rather than bytes inlined into the page,
 * for two reasons that both come from the key being a content hash:
 *
 * - **The cache never has to be invalidated.** `immutable` is a promise that
 *   the bytes at this URL will never change, and here it is true by
 *   construction: different bytes hash to a different key and are therefore a
 *   different URL. A flag corrected by an admin is a new address, not a stale
 *   one.
 * - **A flag is downloaded once per browser, not once per reveal.** Inlining it
 *   in the response that carries hint 3 would re-send the same two kilobytes to
 *   the same player every day. There are ~200 distinct flags in total, so after
 *   the first day Cloudflare answers essentially all of it.
 *
 * It leaks nothing on its own: the URL only ever reaches a client inside the
 * payload of a hint that has already been earned, and the key says nothing
 * about which country it is.
 */

/**
 * A year, and `immutable` — the strongest thing a cache can be told, which the
 * content address is what earns. `s-maxage` is the same: Cloudflare may keep it
 * for ever too.
 */
const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await context.params

  // A key that is not a SHA-256 cannot be in the table, so this is a cheap
  // refusal rather than a validation: it keeps a scan of made-up paths from
  // reaching Postgres at all.
  if (!FLAG_KEY_PATTERN.test(key)) {
    return new Response('Not found', { status: 404 })
  }

  const flag = await readFlag(key)
  if (flag === null) return new Response('Not found', { status: 404 })

  // The stored type is checked on the way *out* as well as on the way in. The
  // store is written by a script, so this is the barrier that survives a
  // future writer: an `image/svg+xml` that somehow reached the table would be
  // executable markup served from this origin, and it is refused here rather
  // than trusted because it is in the database.
  if (!ALLOWED_FLAG_TYPES.includes(flag.contentType)) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(new Uint8Array(flag.bytes), {
    headers: {
      'Content-Type': flag.contentType,
      'Content-Length': String(flag.bytes.byteLength),
      'Cache-Control': CACHE_CONTROL,
      // The bytes are an image and nothing else; no sniffing into something
      // active, whatever a proxy along the way decides to think.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
