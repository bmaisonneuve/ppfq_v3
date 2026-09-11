/**
 * What both personal doors of the game share.
 *
 * `POST /api/game/state` and `POST /api/game/try` are two endpoints and one
 * contract: a JSON body in, a value that belongs to exactly one joueur out, and
 * a CDN in front of the origin. Everything below was written twice before it
 * was written here, and the pair on the client — `use-day-plays.ts` — already
 * shares its half for the same reason.
 *
 * Not a `route.ts`, so it defines no route: a module beside the two that do.
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

/** The headers every answer of these two routes carries. */
export const PERSONAL_HEADERS = { 'Cache-Control': PERSONAL_CACHE_CONTROL }

/** A body that is not JSON is a caller's bug, and `json()` throws on one. */
export async function jsonBody(request: Request): Promise<unknown> {
  return await request.json().catch(() => null)
}
