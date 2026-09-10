import { describe, expect, it } from 'vitest'

import { pool } from '@test/setup/db'

/**
 * The two unique indexes the grid rests on (`docs/modele-donnees.md` §7).
 *
 * They are checked at the schema level rather than only through the service,
 * because the service is not the only hand that will ever write here: the
 * preview screen (#12), a fix run by hand in psql, and whatever #7 reads all
 * depend on "one grid per date, one enigma per position" being true of the
 * *table*. A rule enforced only by the code that happens to be written today is
 * a rule that lasts until the second writer.
 *
 * This is not a service test: it sits in `test/database/` and calls none.
 */

const GRID = `INSERT INTO daily_challenges (id, date, theme) VALUES
  ('00000000-0000-4000-8000-000000005001', '2026-09-09', 'standard')`

describe('the grid schema', () => {
  it('refuses a second grid on the same date', async () => {
    await pool.query(GRID)

    await expect(
      pool.query(`INSERT INTO daily_challenges (date, theme) VALUES ('2026-09-09', 'rétro')`),
    ).rejects.toThrow(/daily_challenges_date_key/)
  })

  it('refuses a second enigma at the same position of a grid', async () => {
    await pool.query(GRID)
    await pool.query(
      `INSERT INTO footballers (id, name) VALUES
        ('00000000-0000-4000-8000-000000003101', 'Zinedine Zidane'),
        ('00000000-0000-4000-8000-000000003102', 'Théo Balland')`,
    )
    const enigma = async (footballer: string) =>
      await pool.query(
        `INSERT INTO challenge_items (daily_challenge_id, position, footballer_id)
         VALUES ('00000000-0000-4000-8000-000000005001', 2, $1)`,
        [footballer],
      )

    await enigma('00000000-0000-4000-8000-000000003101')

    await expect(enigma('00000000-0000-4000-8000-000000003102')).rejects.toThrow(
      /challenge_items_daily_challenge_id_position_key/,
    )
  })

  it('refuses to delete a footballer who carries an enigma', async () => {
    // An enigma designates a footballer (ADR-0001), so deleting him would empty
    // a grid — possibly a published one — without anybody deciding it should be.
    await pool.query(GRID)
    await pool.query(
      `INSERT INTO footballers (id, name)
       VALUES ('00000000-0000-4000-8000-000000003101', 'Zinedine Zidane')`,
    )
    await pool.query(
      `INSERT INTO challenge_items (daily_challenge_id, position, footballer_id)
       VALUES ('00000000-0000-4000-8000-000000005001', 1,
               '00000000-0000-4000-8000-000000003101')`,
    )

    await expect(
      pool.query(
        `DELETE FROM footballers WHERE id = '00000000-0000-4000-8000-000000003101'`,
      ),
    ).rejects.toThrow(/challenge_items/)
  })

  it('takes the enigmas with the grid when the grid goes', async () => {
    await pool.query(GRID)
    await pool.query(
      `INSERT INTO footballers (id, name)
       VALUES ('00000000-0000-4000-8000-000000003101', 'Zinedine Zidane')`,
    )
    await pool.query(
      `INSERT INTO challenge_items (daily_challenge_id, position, footballer_id)
       VALUES ('00000000-0000-4000-8000-000000005001', 1,
               '00000000-0000-4000-8000-000000003101')`,
    )

    await pool.query(`DELETE FROM daily_challenges WHERE date = '2026-09-09'`)

    const { rows } = await pool.query(`SELECT count(*)::text AS count FROM challenge_items`)
    expect(rows[0]).toEqual({ count: '0' })
  })
})
