import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  matchesSharedSecret,
  mintAdminSession,
  verifyAdminSession,
} from '@/server/auth/admin-session'

/**
 * The door to the back-office.
 *
 * A shared secret and a signed cookie — the smallest thing that is a real
 * barrier, standing in until the passwordless account of #13 brings the role
 * check the technical document describes. The trade and the exit are in
 * `docs/adr/0006-porte-du-back-office-avant-better-auth.md`.
 *
 * ## Where the check has to be
 *
 * On **every admin page and every admin Server Action**, and that is not a
 * style preference:
 *
 * - a Server Action is reachable by a direct POST, whatever the page around it
 *   does;
 * - a Next 16 layout does **not** control whether its child segments render.
 *   Route segments are rendered by the router, so a layout that swaps its
 *   children for a login form does not stop the page underneath from running
 *   its queries and reaching the RSC payload.
 *
 * So the layout's check is chrome, and the real gate is per page and per
 * action. A rule applied by hand in a dozen files is a rule someone forgets, so
 * `test/architecture/admin-guard.test.ts` fails the build when one of them
 * does — the same way the `server-only` marker is checked rather than
 * remembered.
 */

/**
 * Two variables, and **both** must be set for the door to open at all. An
 * unconfigured back-office stays shut: a missing variable must never be the
 * thing that lets someone in.
 */
// The *name* of the variable to read, which is exactly why it is in the source
// and the password is not.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
const ADMIN_PASSWORD_VAR = 'ADMIN_PASSWORD'
const ADMIN_SESSION_SECRET_VAR = 'ADMIN_SESSION_SECRET'

const SESSION_COOKIE = 'ppfq_admin'

/**
 * Seven days, where a player's session is 180 (`docs/stack-technique.md`
 * §4bis). A player logs in to keep a streak; the admin holds the keys to the
 * catalogue, this gate is a placeholder, and the cost of signing in again is
 * one password.
 */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/** Where an unauthenticated visitor is sent, and the one page not behind this. */
export const ADMIN_LOGIN_PATH = '/admin/login'

/** Where signing in lands. */
export const ADMIN_HOME_PATH = '/admin'

/**
 * Brute-force throttle, in memory, for the single replica the infrastructure
 * has (`docs/stack-technique.md` §4bis makes the same call for the magic link).
 * It resets when the process restarts, which is acceptable for a lockout meant
 * to make guessing slow rather than impossible.
 */
const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

let failedAttempts = 0
let firstFailureAt = 0

export type AdminSignInResult = 'signed-in' | 'wrong-password' | 'locked-out' | 'not-configured'

/** True when both variables are set. The login page says so rather than lying. */
export function isAdminConfigured(): boolean {
  return adminPassword() !== '' && sessionSecret() !== ''
}

/** Whether this request carries a valid admin session. Reads a cookie, nothing else. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  return verifyAdminSession(sessionSecret(), store.get(SESSION_COOKIE)?.value, Date.now())
}

/**
 * The gate. Called first in every admin page and every admin Server Action.
 *
 * It redirects rather than throwing a 403: there is one admin, and every way of
 * arriving here without a session — an expired cookie, a bookmark, a new
 * browser — is answered by the same thing, the login form. A direct POST to a
 * Server Action gets the redirect and no mutation, which is the point.
 */
export async function requireAdmin(): Promise<void> {
  if (await isAdmin()) return
  redirect(ADMIN_LOGIN_PATH)
}

/**
 * Checks the password and, on success, opens a session.
 *
 * The password is compared in constant time, and a failure moves the throttle
 * whether or not the back-office is configured — an unconfigured deployment
 * must not answer faster than a wrong password.
 */
export async function signInAdmin(password: string): Promise<AdminSignInResult> {
  if (isLockedOut()) return 'locked-out'

  if (!isAdminConfigured()) {
    recordFailure()
    return 'not-configured'
  }

  if (!matchesSharedSecret(adminPassword(), password)) {
    recordFailure()
    return 'wrong-password'
  }

  failedAttempts = 0

  const expiresAt = Date.now() + SESSION_DURATION_MS
  const store = await cookies()
  store.set(SESSION_COOKIE, mintAdminSession(sessionSecret(), expiresAt), {
    httpOnly: true,
    // Off in development, where the back-office is served over plain HTTP and a
    // secure cookie would simply never come back.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  })

  return 'signed-in'
}

/** Drops the session cookie. Signing out twice is not an error. */
export async function signOutAdmin(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

function isLockedOut(): boolean {
  if (Date.now() - firstFailureAt > LOCKOUT_WINDOW_MS) {
    failedAttempts = 0
    return false
  }
  return failedAttempts >= MAX_FAILED_ATTEMPTS
}

function recordFailure(): void {
  if (failedAttempts === 0) firstFailureAt = Date.now()
  failedAttempts += 1
}

/**
 * Read at call time, not at module load: the standalone server reads its
 * environment when it starts, and a value captured in a module constant is a
 * value a restart is needed to change.
 */
function adminPassword(): string {
  return process.env[ADMIN_PASSWORD_VAR] ?? ''
}

function sessionSecret(): string {
  return process.env[ADMIN_SESSION_SECRET_VAR] ?? ''
}
