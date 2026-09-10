import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { players } from '@/server/db/schema'
import { resolvePlayer } from '@/server/services/player.service'
import { isPlayerCookieId } from '@/server/auth/player-cookie'

import { db } from '@test/setup/db'
import { PLAYER_COOKIE_IDS, PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * L'identité anonyme: a joueur is a row of ours, found again by the UUID his
 * browser carries (ADR-0003).
 *
 * The function under test is the whole of it, minus the two lines that touch
 * the cookie store: it takes what the browser presented and answers with the
 * identity to use. That split is deliberate and is the same one as
 * `admin-session.ts` — every case worth having is then a real row in a real
 * database instead of an HTTP response somebody has to construct.
 *
 * Four cases, and each is a joueur:
 *
 * | Presented                    | Who he is                                |
 * |------------------------------|------------------------------------------|
 * | nothing                      | a first visitor                          |
 * | a cookie we know             | somebody coming back — the whole point   |
 * | a well-formed cookie we lost | a purged row, or another deployment      |
 * | anything else                | a forged or mangled value: a new joueur  |
 */
const rows = async () => await db.select().from(players)

const rowOf = async (playerId: string) => {
  const found = await db.select().from(players).where(eq(players.id, playerId))
  const row = found[0]
  if (row === undefined) throw new Error(`No players row for ${playerId}.`)
  return row
}

describe('resolvePlayer', () => {
  it('gives a first visitor an identity, and a row to carry it', async () => {
    const identity = await resolvePlayer(null)

    expect(isPlayerCookieId(identity.cookieId)).toBe(true)
    expect((await rowOf(identity.playerId)).cookieId).toBe(identity.cookieId)
  })

  it('gives him no account: an anonymous joueur is the only kind there is yet', async () => {
    const identity = await resolvePlayer(null)

    // The account is #13, and it will be an `UPDATE` of this column on this
    // same row — never a second row, and never a migration of his parties.
    expect((await rowOf(identity.playerId)).authUserId).toBeNull()
  })

  it('gives two first visitors two identities', async () => {
    const one = await resolvePlayer(null)
    const two = await resolvePlayer(null)

    expect(one.playerId).not.toBe(two.playerId)
    expect(await rows()).toHaveLength(2)
  })

  describe('a joueur who comes back', () => {
    beforeEach(async () => {
      await seedPlayers(db)
    })

    it('is the same joueur, which is the whole promise of the cookie', async () => {
      const identity = await resolvePlayer(PLAYER_COOKIE_IDS.mine)

      expect(identity).toEqual({
        playerId: PLAYER_IDS.mine,
        cookieId: PLAYER_COOKIE_IDS.mine,
      })
      expect(await rows()).toHaveLength(2)
    })

    it('is seen again, because the purge has nothing else to go on', async () => {
      // 13 months without being seen is what makes a row purgeable, so a
      // request that did not bump this would eventually delete the progression
      // of somebody who plays every day.
      const past = new Date('2025-01-01T00:00:00Z')
      await db
        .update(players)
        .set({ lastSeenAt: past })
        .where(eq(players.id, PLAYER_IDS.mine))

      await resolvePlayer(PLAYER_COOKIE_IDS.mine)

      expect((await rowOf(PLAYER_IDS.mine)).lastSeenAt.getTime()).toBeGreaterThan(
        past.getTime(),
      )
    })

    it('never becomes somebody else’s joueur', async () => {
      expect((await resolvePlayer(PLAYER_COOKIE_IDS.other)).playerId).toBe(PLAYER_IDS.other)
    })
  })

  it('adopts a well-formed cookie whose row is gone, and keeps the browser’s value', async () => {
    // A purged row, a wiped database, a joueur arriving on another deployment.
    // Minting a new UUID instead would work too — and would set a cookie the
    // browser did not ask for. Keeping the presented one is what makes this
    // function idempotent for a returning joueur, whatever happened in between.
    const presented = '33333333-3333-4333-8333-333333333333'

    const identity = await resolvePlayer(presented)

    expect(identity.cookieId).toBe(presented)
    expect((await rowOf(identity.playerId)).cookieId).toBe(presented)
  })

  it('makes one joueur out of a burst of simultaneous first requests', async () => {
    // A page that fires its personal request twice, or two tabs opened
    // together. The unique index on `cookie_id` is the guard; the insert loses
    // the race silently and the loser reads the row that won.
    const presented = '44444444-4444-4444-8444-444444444444'

    const identities = await Promise.all(
      Array.from({ length: 8 }, async () => await resolvePlayer(presented)),
    )

    const distinct = new Set(identities.map((identity) => identity.playerId))
    expect(distinct.size).toBe(1)
    expect(await rows()).toHaveLength(1)
  })

  describe('a value that is not an identity', () => {
    it('is answered with a fresh one rather than with an error', async () => {
      const identity = await resolvePlayer('not-an-uuid')

      expect(isPlayerCookieId(identity.cookieId)).toBe(true)
      expect(identity.cookieId).not.toBe('not-an-uuid')
    })

    it('never reaches the table', async () => {
      // The value comes from the client and the column is unique: what is
      // refused must not be what is stored, or a mangled cookie would be an
      // identity like any other.
      await resolvePlayer('x'.repeat(5_000))

      const stored = await rows()
      expect(stored).toHaveLength(1)
      expect(isPlayerCookieId(stored[0]?.cookieId)).toBe(true)
    })
  })
})
