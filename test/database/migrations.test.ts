import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'

import { runMigrations, withPool } from '../../scripts/db.ts'

/**
 * The migrations are the schema. This checks the two things that must hold the
 * day they reach production: they run on an empty database, and running them
 * again changes nothing.
 *
 * It works on a scratch database of its own, so the suite's own database is
 * left alone. This is not a service test — it sits in `test/database/` rather
 * than `test/services/` so the service seam stays what issue #1 says it is.
 */
const SCRATCH_DATABASE = 'ppfq_migration_check'

function urlWithDatabase(database: string): string {
  const base = process.env.DATABASE_URL
  if (base === undefined || base === '') {
    throw new Error('DATABASE_URL is not set for the test run.')
  }
  const url = new URL(base)
  url.pathname = `/${database}`
  return url.toString()
}

const adminUrl = () => urlWithDatabase('postgres')
const scratchUrl = () => urlWithDatabase(SCRATCH_DATABASE)

beforeAll(async () => {
  await withPool(adminUrl(), async (pool) => {
    await pool.query(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`)
    await pool.query(`CREATE DATABASE ${SCRATCH_DATABASE}`)
  })
})

afterAll(async () => {
  await withPool(adminUrl(), async (pool) =>
    await pool.query(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`),
  )
})

describe('migrations', () => {
  it('apply to a virgin database, and applying them again is a no-op', async () => {
    await runMigrations(scratchUrl())

    await withPool(scratchUrl(), async (pool) => {
      const tablesAfterFirstRun = await tableNames(pool)
      expect(tablesAfterFirstRun).toEqual([
        'challenge_items',
        'clubs',
        'daily_challenges',
        'footballer_names',
        'footballers',
        'job_runs',
        'nationalities',
        'nationality_flags',
        'player_clubs',
        'player_progress',
        'players',
      ])

      // A row survives the replay: the second run must not recreate anything.
      await pool.query(`INSERT INTO nationalities (code, fr_name) VALUES ('FR', 'France')`)

      await runMigrations(scratchUrl())

      expect(await tableNames(pool)).toEqual(tablesAfterFirstRun)
      const { rows } = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM nationalities',
      )
      expect(rows[0]?.count).toBe('1')
    })
  })
})

async function tableNames(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )
  return rows.map((r) => r.tablename)
}
