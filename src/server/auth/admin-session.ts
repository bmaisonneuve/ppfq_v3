import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The admin cookie: a signed expiry, and nothing else.
 *
 * ## Why this exists at all
 *
 * The back-office is meant to sit behind the same passwordless account as the
 * players — magic link and six-digit code, with a role check
 * (`docs/stack-technique.md` §4bis). That account is #13, and the curation
 * screen is #5: the editor cannot wait three tickets for a door. This module is
 * that door, and it is deliberately the *smallest* thing that is a real
 * barrier — see `docs/adr/0006-porte-du-back-office-avant-better-auth.md`.
 *
 * It is one seam. Replacing it with Better Auth means rewriting
 * `services/admin-auth.service.ts` and deleting this file; nothing else in the
 * admin knows how a session is made.
 *
 * ## Why the secret is an argument
 *
 * Reading `process.env` here would make every interesting case — a wrong
 * secret, no secret, a rotated secret — an environment-juggling integration
 * test. As an argument they are a pure matrix (`test/domain/admin-session.test.ts`),
 * and the one place that reads the environment is the service.
 *
 * ## What is *not* in the token
 *
 * No identity, no role, no user id: there is exactly one admin, so a valid
 * signature *is* the role check. The day there are two, this becomes a session
 * row and the payload becomes a user id — which is #13 arriving, not a change
 * of shape here.
 */

/** `<expiry in ms>.<base64url HMAC-SHA256 of that expiry>`. */
const TOKEN_PARTS = 2

/**
 * Signs an expiry. The value is safe to hand to a browser: it says when the
 * session dies and proves nothing else.
 *
 * An empty secret still produces a token, and `verifyAdminSession` still
 * refuses it — the refusal lives in one place rather than two.
 */
export function mintAdminSession(secret: string, expiresAt: number): string {
  const expiry = String(Math.trunc(expiresAt))
  return `${expiry}.${sign(secret, expiry)}`
}

/**
 * Whether a cookie value is a session this secret signed and that has not run
 * out.
 *
 * **No secret means no access.** A back-office that opens because a variable is
 * missing from the environment fails silently and on the side that lets people
 * in; this one fails shut, and the operator finds out because he cannot get in
 * either.
 */
export function verifyAdminSession(
  secret: string,
  token: string | undefined,
  now: number,
): boolean {
  if (secret === '' || token === undefined || token === '') return false

  const parts = token.split('.')
  if (parts.length !== TOKEN_PARTS) return false

  const [expiry, signature] = parts as [string, string]
  // `Number` on a non-numeric string is NaN, and every comparison below is
  // false — but say so explicitly rather than leaning on that.
  const expiresAt = Number(expiry)
  if (!Number.isFinite(expiresAt)) return false

  if (!constantTimeEquals(signature, sign(secret, expiry))) return false

  return now <= expiresAt
}

/**
 * Whether a submitted secret is the configured one, compared in constant time.
 *
 * Both sides are hashed before the comparison, so the buffers are always the
 * same length: `timingSafeEqual` throws on a length mismatch, and answering
 * early on length would leak how long the secret is.
 *
 * An unconfigured secret matches nothing, including the empty string. Same rule
 * as the token, same reason.
 */
export function matchesSharedSecret(expected: string, given: string): boolean {
  if (expected === '') return false
  return constantTimeEquals(expected, given)
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function constantTimeEquals(a: string, b: string): boolean {
  const digest = (value: string) => createHmac('sha256', 'compare').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}
