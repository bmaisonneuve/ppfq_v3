/**
 * What the personal doors of the game share.
 *
 * `POST /api/game/state`, `POST /api/game/try` and `POST /api/game/stats` are
 * three endpoints and one contract: a value that belongs to exactly one joueur
 * out, a CDN in front of the origin, and a cookie that names who is asking.
 * Everything below was written twice before it was written here, and the client
 * — `use-day-plays.ts` — already shares its half for the same reason.
 *
 * A JSON body **in** is only two thirds of it: the statistics door reads none,
 * because the joueur is the whole of the question and he is in the cookie. So
 * `jsonBody` is exported next to the headers rather than folded into them — the
 * headers go on every answer of all three, the parsing on the two that parse.
 *
 * Not a `route.ts`, so it defines no route: a module beside the three that do.
 */

/**
 * Personal, and therefore cached nowhere: not by the browser, not by
 * Cloudflare, not by anything in between.
 *
 * A POST is not cacheable to begin with; saying so is what keeps that from
 * depending on a default. It goes on **every** answer, the refusals and the
 * bad requests included — a 400 that got served to the next caller would be
 * the same bug as a 200 that did.
 */
export const PERSONAL_CACHE_CONTROL = 'private, no-store'

/** The headers every answer of these three routes carries. */
export const PERSONAL_HEADERS = { 'Cache-Control': PERSONAL_CACHE_CONTROL }

/** A body that is not JSON is a caller's bug, and `json()` throws on one. */
export async function jsonBody(request: Request): Promise<unknown> {
  return await request.json().catch(() => null)
}
