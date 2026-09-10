import 'server-only'

import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { players } from '@/server/db/schema'
import {
  PLAYER_COOKIE,
  isPlayerCookieId,
  mintPlayerCookieId,
  playerCookieOptions,
} from '@/server/auth/player-cookie'

/**
 * Le joueur behind a request — with or without an account.
 *
 * A joueur is a row of ours, found again by the UUID his browser carries, and
 * not Better Auth's `anonymous` plugin: that plugin opens an authentication
 * session per visitor and **deletes the anonymous row on linking**, which would
 * erase exactly the progression the specs promise to carry over (ADR-0003). So
 * the reprise de progression will be an `UPDATE players SET auth_user_id`
 * (#13), and nothing that points at a joueur has to move.
 *
 * ## Why this is split in two
 *
 * `currentPlayerId` is the door and it is four lines: read the cookie, resolve
 * it, write the cookie back. `resolvePlayer` is everything else, and it takes
 * the presented value as an argument rather than reaching for the request — the
 * same trade as `auth/admin-session.ts`. That is what makes a first visitor, a
 * returning joueur, a purged row, a forged value and a burst of simultaneous
 * requests five rows in a real database instead of five HTTP responses to
 * construct (`test/services/player.service.test.ts`).
 *
 * ## Where this may be called from
 *
 * Only from a Route Handler or a Server Action. Setting a cookie during a
 * render is not possible — HTTP does not allow it once streaming has started —
 * and on the page of la grille du jour it would be worse than impossible: that
 * route reads nothing that belongs to a request, which is what keeps it
 * prerendered and cacheable full-page (ADR-0008), and one call to this function
 * from inside it would undo the architecture.
 */

/** A joueur and the cookie value that names him. */
export type PlayerIdentity = {
  playerId: string
  /** What the browser must carry away — the presented value, or a new one. */
  cookieId: string
}

/**
 * The joueur of this request, created on his first visit, and his cookie
 * refreshed on the way out.
 *
 * The cookie is written on **every** call and that is the "glissant" of « 13
 * mois glissants »: a joueur who comes back keeps his progression indefinitely,
 * and one who stops is purged along with his row when the cookie would have
 * expired anyway.
 */
export async function currentPlayerId(): Promise<string> {
  const store = await cookies()
  const identity = await resolvePlayer(store.get(PLAYER_COOKIE)?.value ?? null)

  store.set(
    PLAYER_COOKIE,
    identity.cookieId,
    playerCookieOptions(process.env.NODE_ENV === 'production'),
  )

  return identity.playerId
}

/**
 * The identity to use, given what the browser presented.
 *
 * Presented, and therefore not trusted for its shape: anything that is not an
 * UUID is replaced rather than refused (`isPlayerCookieId`), because a mangled
 * cookie is not an incident — it is somebody who gets a new identity, which is
 * what a first visitor gets anyway. Nothing else about it is checked, and there
 * is nothing else to check: the value is opaque, holding it *is* being that
 * joueur, and the game has no ranking to defend
 * (`docs/stack-technique.md` §4).
 *
 * A well-formed cookie whose row is gone — purged after 13 months, or a joueur
 * arriving on a fresh database — is **adopted** rather than replaced. Keeping
 * the presented value is what makes this function idempotent for a returning
 * joueur whatever happened in between, and it leaves the browser holding the
 * cookie it already had.
 */
export async function resolvePlayer(presented: string | null): Promise<PlayerIdentity> {
  const cookieId = isPlayerCookieId(presented) ? presented : mintPlayerCookieId()

  const seen = await seeAgain(cookieId)
  if (seen !== undefined) return { playerId: seen, cookieId }

  return { playerId: await ensurePlayer(cookieId), cookieId }
}

/**
 * Finds a joueur and marks him seen in the same statement.
 *
 * One `UPDATE ... RETURNING` rather than a select then an update: `last_seen_at`
 * is the only thing the purge can go on, so it has to move on every personal
 * read, and it would be a second round trip on the hottest path of the game.
 */
async function seeAgain(cookieId: string): Promise<string | undefined> {
  const rows = await db
    .update(players)
    .set({ lastSeenAt: new Date() })
    .where(eq(players.cookieId, cookieId))
    .returning({ id: players.id })

  return rows[0]?.id
}

/**
 * Creates the joueur, or reads the one a simultaneous request created — hence
 * `ensure` and not `create`: on the racing path this returns a row it did not
 * write.
 *
 * `onConflictDoNothing` and then a read, rather than a check and then an
 * insert: a page firing its personal request twice, or two tabs opened
 * together, would slip between the two halves of the second version. The unique
 * index on `cookie_id` decides, the loser inserts nothing, and both requests
 * answer with the same joueur.
 */
async function ensurePlayer(cookieId: string): Promise<string> {
  const created = await db
    .insert(players)
    .values({ cookieId })
    .onConflictDoNothing()
    .returning({ id: players.id })

  const inserted = created[0]?.id
  if (inserted !== undefined) return inserted

  const raced = await seeAgain(cookieId)
  if (raced !== undefined) return raced

  // Neither inserted nor found: the row was deleted between the two statements,
  // which takes a purge landing on this exact cookie in this exact millisecond.
  // Saying so beats returning an identity that names nobody.
  throw new Error('The joueur could not be created.')
}
