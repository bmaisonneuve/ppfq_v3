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
/**
 * The one row a statement just returned.
 *
 * `noUncheckedIndexedAccess` types `rows[0]` as possibly absent, and it is
 * right to: an insert that returned nothing is a broken test, not a case to
 * work around. Saying so once here is what keeps a `!` out of every
 * `.returning()` in the suite.
 */
export function onlyRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows
  if (row === undefined) throw new Error('The statement returned no row.')
  return row
}

export async function resetDatabase(): Promise<void> {
  const { rows } = await pool.query<{ tables: string | null }>(sqlAllTables)
  const tables = rows[0]?.tables
  if (tables === undefined || tables === null || tables === '') return
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
}

const sqlAllTables = `
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') AS tables
  FROM pg_tables
  WHERE schemaname = 'public'
`
