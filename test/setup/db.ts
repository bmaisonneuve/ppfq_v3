import { sql } from 'drizzle-orm'

import { db, pool } from '@/server/db/client'

/**
 * The handle the integration suite uses. It is the application's own handle:
 * tests and services talk to the same database through the same pool, so a test
 * can never pass against a connection the application does not use.
 */
export { db, pool }

/**
 * Empties every table, leaving the schema alone. Tables are discovered rather
 * than listed, so a ticket that adds one does not have to remember this file.
 */
export async function resetDatabase(): Promise<void> {
  const { rows } = await pool.query<{ tables: string | null }>(sqlAllTables)
  const tables = rows[0]?.tables
  if (!tables) return
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
}

const sqlAllTables = `
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') AS tables
  FROM pg_tables
  WHERE schemaname = 'public'
`
