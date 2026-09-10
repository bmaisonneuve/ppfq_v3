import 'server-only'

import { randomUUID } from 'node:crypto'

/**
 * The cookie that carries the identité anonyme: an UUID, and nothing else.
 *
 * ## Why there is nothing to sign
 *
 * Its neighbour in this directory, `admin-session.ts`, is a signed token
 * because a valid signature *is* the admin's role check. Here there is no role
 * and no claim: the value is an opaque, unguessable identifier, and holding it
 * simply *is* being that joueur. Signing it would protect nothing — the game
 * has no ranking, and « quelqu'un qui rotate son cookie d'identité anonyme pour
 * forcer une réponse ne pénalise que lui » (`docs/stack-technique.md` §4). The
 * one thing worth checking is the shape, and that is `isPlayerCookieId`.
 *
 * It lives in `auth/` all the same, and the tension is worth naming: the
 * anonymous identity is deliberately **not** an authentication (ADR-0003 keeps
 * it out of Better Auth entirely). But this directory is where a cookie's name,
 * lifetime and attributes are decided in this codebase, and having the site's
 * two cookies side by side is what makes the difference between them legible.
 *
 * ## Why the policy is a value and not an options literal
 *
 * The promise attached to this cookie — strictly necessary, therefore no
 * consent banner, therefore 13 months and no analytics tracker anywhere on the
 * site (ADR-0003, `docs/modele-donnees.md` §10) — is not the kind of thing to
 * leave inlined at the one call that sets it. As a value it is a pure matrix in
 * `test/domain/player-cookie.test.ts`; inlined it would be an HTTP response
 * somebody has to remember to look at.
 */

/** The name, once. `ppfq_admin` is the other one, and there are no others. */
export const PLAYER_COOKIE = 'ppfq_player'

/**
 * 13 months, in seconds.
 *
 * 13 months is a **ceiling**, so the rounding goes downwards: 396 days is a
 * 13-month span of the shortest possible shape, and one that happens to contain
 * a 29 February is 397 days long. A day under the cap is correct; a day over it
 * is not.
 *
 * The purge of `players` follows the same duration: a joueur whose cookie has
 * expired can no longer be found, so keeping his row would keep personal data
 * nobody can ever reach again.
 *
 * Asserted twice, and the second one is worth knowing about before changing
 * this number: `test/domain/player-cookie.test.ts` on the constant, and a grep
 * of `Max-Age=34214400` on the real response in `.github/workflows/ci.yml` —
 * which is a literal in YAML, because what it checks is a property of the
 * *answer* and nothing in the suite can see it.
 */
export const PLAYER_COOKIE_MAX_AGE_SECONDS = 396 * 24 * 60 * 60

/** Exactly what is handed to `cookies().set` — no more, and nothing optional. */
export type PlayerCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
}

/**
 * The attributes, and every one of them is a decision:
 *
 * - **`maxAge` rather than `expires`.** « 13 mois glissants »: the lifetime
 *   restarts on every answer that carries the cookie, so a joueur who comes
 *   back keeps his progression indefinitely and one who never does is purged
 *   with his row. A fixed date would expire the identity of a daily player 13
 *   months after his first visit, which is precisely the person it exists for.
 * - **`httpOnly`.** The client never reads the value — the personal state
 *   arrives from the server, which already knows who is asking — so the
 *   identity stays out of reach of any injected script.
 * - **`sameSite: 'lax'`.** Not `strict`: a daily game is opened from a link in
 *   a mail or on social media, and `strict` would drop the cookie on exactly
 *   that navigation and hand the joueur a brand new identity.
 * - **`secure` in production only.** `next dev` serves plain HTTP, where a
 *   secure cookie is never sent back: the identity would be lost on every
 *   request and no partie would ever be found again — locally, which is the
 *   worst place for a difference nobody can see.
 */
export function playerCookieOptions(production: boolean): PlayerCookieOptions {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: PLAYER_COOKIE_MAX_AGE_SECONDS,
  }
}

/** A new identity. Unguessable is the whole security model, so this is a v4 UUID. */
export function mintPlayerCookieId(): string {
  return randomUUID()
}

/**
 * Whether what a browser presented is an identity at all.
 *
 * The value comes from the client and ends up in a `text` column under a unique
 * index, so the shape is checked before it goes anywhere near it: the column
 * stays bounded, and the identifier stays the 122 unguessable bits that are the
 * only thing protecting one joueur's progression from another's.
 *
 * A value that fails is **not an error**. It is a joueur who is handed a fresh
 * identity, which is what a first visitor gets anyway.
 *
 * Upper case is accepted although nothing here writes it: a value that has
 * round-tripped through something that upper-cased it is still the same
 * identity, and refusing it would silently take a progression away.
 */
export function isPlayerCookieId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
