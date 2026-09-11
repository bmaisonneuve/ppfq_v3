/**
 * The nationality's isomorphic layer: where a flag is served from, and what a
 * flag key is allowed to look like.
 *
 * Its own file rather than a corner of `shared/career.ts` for the reason
 * `shared/club.ts` exists: a nationality is shared by every footballer who
 * carries it, so replacing its flag touches every enigma at once, where a
 * career belongs to one footballer.
 */

/**
 * The stable, content-addressed URL a flag is served at.
 *
 * The key **is** the SHA-256 of the bytes, so this URL identifies exactly those
 * bytes and can be cached for ever. Replacing a nationality's flag writes
 * different bytes, therefore a different key, therefore a different URL: there
 * is nothing to invalidate, which is the whole reason the address is the
 * content.
 *
 * One definition, because the page that renders an `<img>` and the route that
 * answers it have to agree, and because the day the bytes move to a bucket this
 * is the single line that changes.
 */
export function flagUrl(key: string): string {
  return `/api/flags/${key}`
}

/** A SHA-256 in lower-case hex — what the read path accepts, and nothing else. */
export const FLAG_KEY_PATTERN = /^[0-9a-f]{64}$/

/**
 * What the flag store holds, and it is deliberately **raster only**.
 *
 * No `image/svg+xml`: an SVG is executable markup, and this one would be served
 * from the site's own origin. The source is a set of SVG files, which is
 * exactly why the rule has to be stated here rather than assumed — the seed
 * renders them and stores the rendering, never the source.
 */
export const ALLOWED_FLAG_TYPES: readonly string[] = [
  'image/webp',
  'image/png',
  'image/jpeg',
]

/**
 * A ceiling on a stored flag. Measured across the whole source rendered at
 * `FLAG_WIDTH`: 1,3 kB the median, 12 kB the worst. This is a guard against a
 * photograph dropped in by mistake, not a budget.
 */
export const MAX_FLAG_BYTES = 256 * 1024

/**
 * The box every flag is rendered into, and the box it is displayed in.
 *
 * **4:3, and the image is fitted into it rather than stretched to it.** The 271
 * flags of `flag-icons` are all drawn on a `0 0 640 480` viewBox, so they fill
 * the box exactly; the handful of dead countries that flag-icons does not have
 * come from Commons at their true ratio — Yugoslavia is 2:1 — and are centred
 * with transparent bands above and below.
 *
 * Both halves of that matter. A common box is what lets a list of flags align
 * instead of jittering, and fitting rather than filling is what keeps the
 * Yugoslav star round. Stretching 2:1 into 4:3 is the kind of wrong that nobody
 * notices until it is in production.
 *
 * 192 px is three times the largest size any screen shows a flag at, so a
 * high-density display has its pixels and nothing is stored for a size nobody
 * renders.
 */
export const FLAG_WIDTH = 192
export const FLAG_HEIGHT = 144
