import { describe, expect, it } from 'vitest'

import { pool } from '@test/setup/db'

/**
 * The constraints la partie rests on (`docs/modele-donnees.md` §7), checked at
 * the schema level rather than only through the service.
 *
 * Same reason as the grid's: the service is not the only hand that will ever
 * write here. The preview screen (#12), the reprise de progression (#13), a fix
 * run by hand in psql — all of them depend on "one partie per (enigma, joueur)"
 * and "one joueur per cookie" being true of the *tables*. A rule enforced only
 * by the code that happens to exist today lasts until the second writer.
 *
 * The two cascades are here for a sharper reason: one of them decides whether
 * an admin correcting a theme in the afternoon deletes the day's parties. It
 * does, if the enigma row goes — which is exactly why `scheduleGrid` keeps the
 * rows whose footballer has not changed.
 *
 * This is not a service test: it sits in `test/database/` and calls none.
 */
const PLAYER = '00000000-0000-4000-8000-000000006101'
const OTHER_PLAYER = '00000000-0000-4000-8000-000000006102'
const GRID = '00000000-0000-4000-8000-000000005101'
const ENIGMA = '00000000-0000-4000-8000-000000005102'
const FOOTBALLER = '00000000-0000-4000-8000-000000003101'

/** One joueur, one grid, one enigma: the smallest thing a partie can hang off. */
async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO players (id, cookie_id) VALUES
      ($1, '11111111-1111-4111-8111-111111111111'),
      ($2, '22222222-2222-4222-8222-222222222222')`,
    [PLAYER, OTHER_PLAYER],
  )
  await pool.query(`INSERT INTO footballers (id, name) VALUES ($1, 'Zinedine Zidane')`, [
    FOOTBALLER,
  ])
  await pool.query(
    `INSERT INTO daily_challenges (id, date, theme) VALUES ($1, '2026-09-09', 'standard')`,
    [GRID],
  )
  await pool.query(
    `INSERT INTO challenge_items (id, daily_challenge_id, position, footballer_id)
     VALUES ($1, $2, 1, $3)`,
    [ENIGMA, GRID, FOOTBALLER],
  )
}

const openPartie = async (playerId: string) =>
  await pool.query(
    `INSERT INTO player_progress (challenge_item_id, player_id, mode) VALUES ($1, $2, 'daily')`,
    [ENIGMA, playerId],
  )

const countParties = async () => {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM player_progress',
  )
  return rows[0]?.count
}

describe('the partie schema', () => {
  it('refuses a second partie for the same joueur on the same enigma', async () => {
    await seed()
    await openPartie(PLAYER)

    // State, not a journal: the essai updates this row. Two of them would make
    // "how many people saw this enigma" a number nobody can trust.
    await expect(openPartie(PLAYER)).rejects.toThrow(
      /player_progress_challenge_item_id_player_id_key/,
    )
  })

  it('lets two joueurs play the same enigma', async () => {
    await seed()
    await openPartie(PLAYER)
    await openPartie(OTHER_PLAYER)

    expect(await countParties()).toBe('2')
  })

  it('takes a joueur’s parties with him', async () => {
    // The purge deletes a `players` row after 13 months; it must not leave a
    // partie behind pointing at nobody.
    await seed()
    await openPartie(PLAYER)

    await pool.query('DELETE FROM players WHERE id = $1', [PLAYER])

    expect(await countParties()).toBe('0')
  })

  it('takes the parties of an enigma that is deleted', async () => {
    // The cascade that matters most, and the one that shaped `scheduleGrid`:
    // reprogramming a day rewrites `challenge_items`, so rewriting a row the
    // admin did not change would delete every partie on it.
    await seed()
    await openPartie(PLAYER)

    await pool.query('DELETE FROM challenge_items WHERE id = $1', [ENIGMA])

    expect(await countParties()).toBe('0')
  })

  it('demands a mode, so nothing can be a partie of no mode at all', async () => {
    // No default on the column: only the quotidien feeds the série and the
    // cartons pleins (specs §7), and the archive (#14) must say so explicitly
    // rather than inherit the mode that counts.
    await seed()

    await expect(
      pool.query(
        `INSERT INTO player_progress (challenge_item_id, player_id) VALUES ($1, $2)`,
        [ENIGMA, PLAYER],
      ),
    ).rejects.toThrow(/mode/)
  })
})

describe('the joueur schema', () => {
  it('refuses two joueurs behind one cookie', async () => {
    await seed()

    // What makes resolving a cookie idempotent under a burst of simultaneous
    // first requests: the insert loses the race instead of doubling the joueur.
    await expect(
      pool.query(
        `INSERT INTO players (cookie_id) VALUES ('11111111-1111-4111-8111-111111111111')`,
      ),
    ).rejects.toThrow(/players_cookie_id_key/)
  })

  it('refuses two joueurs behind one account', async () => {
    // The reprise de progression is an `UPDATE` of this column (#13, ADR-0003).
    // Two rows carrying the same account would be two progressions for one
    // person, and no way to say which is his.
    await seed()
    await pool.query(`UPDATE players SET auth_user_id = 'user_1' WHERE id = $1`, [PLAYER])

    await expect(
      pool.query(`UPDATE players SET auth_user_id = 'user_1' WHERE id = $1`, [OTHER_PLAYER]),
    ).rejects.toThrow(/players_auth_user_id_key/)
  })

  it('lets every joueur without an account be without one', async () => {
    // A unique index over a nullable column: Postgres treats nulls as distinct,
    // which is the only reason millions of anonymous joueurs can coexist.
    await seed()

    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM players WHERE auth_user_id IS NULL',
    )
    expect(rows[0]?.count).toBe('2')
  })
})
