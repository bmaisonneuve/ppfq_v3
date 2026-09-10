/**
 * Two joueurs, both without an account.
 *
 * Two rather than one on purpose: nearly everything about a partie is a
 * statement about *whose* it is, and a suite with a single joueur cannot tell
 * "reads my partie" from "reads a partie". Every ticket that needs a joueur
 * seeds from here.
 *
 * Both are anonymous — `auth_user_id` is null — which is the only state that
 * exists until the account arrives (#13). The reprise de progression is then an
 * `UPDATE` of that column on these same rows, never a new row (ADR-0003).
 */
import { players } from '@/server/db/schema'
import type { Db } from '@/server/db/client'

/** Fixed, readable identifiers. The leading digit says which table a row is in. */
const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

export const PLAYER_IDS = {
  /** The joueur a test is about. */
  mine: uuid('6001'),
  /** Somebody else, playing the same grid. He is here to not be read. */
  other: uuid('6002'),
} as const

/**
 * The cookie each one carries. Real UUIDs, because `isPlayerCookieId` refuses
 * anything else and a fixture that could not have come from the application is
 * a fixture that proves nothing.
 */
export const PLAYER_COOKIE_IDS = {
  mine: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
} as const

export async function seedPlayers(executor: Db): Promise<void> {
  await executor.insert(players).values([
    { id: PLAYER_IDS.mine, cookieId: PLAYER_COOKIE_IDS.mine },
    { id: PLAYER_IDS.other, cookieId: PLAYER_COOKIE_IDS.other },
  ])
}
