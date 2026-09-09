import { describe, expect, it } from 'vitest'

import { pool } from '@test/setup/db'

/**
 * The two indexes on `footballer_names` are half of what issue #3 delivers, and
 * the reason there are two: btree `text_pattern_ops` serves the prefix, which is
 * the dominant case, and GIN trigrams serve typo tolerance — trigrams alone are
 * bad on short prefixes (docs/modele-donnees.md §7).
 *
 * Losing either one leaves a suite that still passes on fixture-sized data and
 * an endpoint that sequential-scans 600 000 rows in production. So the schema is
 * checked rather than trusted. This is not a service test: it sits in
 * `test/database/` and calls nothing.
 */
async function indexDefinitions(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
    [table],
  )
  return rows.map((r) => r.indexdef)
}

describe('the search referential schema', () => {
  it('has pg_trgm installed, without which the trigram index cannot exist', async () => {
    const { rows } = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    )

    expect(rows).toHaveLength(1)
  })

  it('indexes the term for the prefix, with the operator class LIKE needs', async () => {
    // A plain btree index cannot serve `term LIKE 'zid%'` unless the database
    // collation is C: `text_pattern_ops` is what makes the prefix query an index
    // scan wherever it runs.
    const definitions = await indexDefinitions('footballer_names')

    expect(definitions).toContainEqual(
      expect.stringMatching(/USING btree \("?term"? text_pattern_ops\)/),
    )
  })

  it('indexes the term for trigrams', async () => {
    const definitions = await indexDefinitions('footballer_names')

    expect(definitions).toContainEqual(
      expect.stringMatching(/USING gin \("?term"? gin_trgm_ops\)/),
    )
  })

  it('carries the ranking columns in the order the typeahead asks for them', async () => {
    // Notoriety, then name, then id. All three, because the prefix query is a
    // top-N over this index: with the columns missing Postgres cannot stop at
    // the tenth match and aggregates every name matching a two-letter prefix
    // instead — 117 ms against 0.8 ms on the real extract.
    //
    // And no `NULLS LAST`, which Postgres would print if it were there. `ORDER
    // BY sitelinks DESC` means DESC NULLS FIRST, and an index declared NULLS
    // LAST cannot supply that ordering — the early stop is silently lost while
    // every result stays correct. That is the whole reason this assertion is
    // written on the index *definition* rather than left to a plan nobody reads.
    const definitions = await indexDefinitions('footballers')

    expect(definitions).toContainEqual(
      expect.stringMatching(/USING btree \("?sitelinks"? DESC, ?"?name"?, ?"?id"?\)/),
    )
  })

  it('keeps one row per footballer and term, which is what makes the import idempotent', async () => {
    const definitions = await indexDefinitions('footballer_names')

    expect(definitions).toContainEqual(
      expect.stringMatching(/CREATE UNIQUE INDEX .*\("?footballer_id"?, ?"?term"?\)/),
    )
  })
})
