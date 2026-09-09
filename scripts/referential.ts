/**
 * The search referential import: the 382 703 footballers and 225 886 aliases of
 * `.data/` into `footballers` and `footballer_names`.
 *
 * ## Why this is tooling and not a service
 *
 * Services are the only way into the application, and the Wikidata *career*
 * pipeline (#4) will be one: the admin triggers it from the back-office, one
 * footballer at a time. This one is not that. It is a bootstrap that loads two
 * files from disk once, at deploy time, like a migration — and it has to run
 * under plain Node, where `import 'server-only'` throws. So it lives in
 * `scripts/` beside the migration runner, and the app never imports it.
 *
 * What it does share with the application is the definition of a term:
 * `nameSearchTerms` and `normalizeSearchTerm` from `src/shared/search.ts`, the
 * same functions the query path and the career import call. That is the whole
 * contract between the halves — a term normalised any other way is a footballer
 * nobody can find.
 *
 * ## Shape of the run
 *
 * Two temp tables, then two set-based statements. The staging tables are what
 * let the homonym de-duplication be a `DISTINCT ON` instead of 382 703 rows of
 * bookkeeping in Node, and what let the alias rows find their footballer by a
 * join rather than by a 40 MB map in memory.
 *
 * Everything is one transaction: a referential half-loaded is worse than one not
 * loaded at all, since the typeahead would answer, just wrongly.
 */
import { createReadStream } from 'node:fs'

import type { PoolClient } from 'pg'

import { nameSearchTerms } from '../src/shared/search.ts'

import { withPool } from './db.ts'

/** Rows per INSERT. 1 000 × 6 columns stays far below Postgres' 65 535 parameters. */
const BATCH_SIZE = 1_000

export type ReferentialImportReport = {
  /** Data rows read from `footballers.csv`. */
  footballersRead: number
  /** Rows written to `footballers` — inserted or updated. */
  footballersKept: number
  /** Read but not kept: a more notorious footballer already had the name. */
  homonymsDropped: number
  /** Data rows read from `footballer_aliases.csv`. */
  aliasesRead: number
  /** Rows written to `footballer_names`, canonical names and aliases together. */
  termsWritten: number
}

export type ReferentialImportOptions = {
  connectionString: string
  footballersCsv: string
  aliasesCsv: string
  /** Called while staging, so a 600 000-row load is not a silent two minutes. */
  onProgress?: (staged: { footballers: number; aliases: number }) => void
}

export async function importReferential(
  options: ReferentialImportOptions,
): Promise<ReferentialImportReport> {
  return await withPool(options.connectionString, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const report = await importWithinTransaction(client, options)
      await client.query('COMMIT')
      return report
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
}

/** The whole load. `importReferential` owns the transaction around it. */
async function importWithinTransaction(
  client: PoolClient,
  options: ReferentialImportOptions,
): Promise<ReferentialImportReport> {
  await createStagingTables(client)

  const staged = await stage(client, options)

  const footballersKept = await upsertFootballers(client)
  const termsWritten = await upsertTerms(client)

  return {
    footballersRead: staged.footballers,
    footballersKept,
    homonymsDropped: staged.footballers - footballersKept,
    aliasesRead: staged.aliases,
    termsWritten,
  }
}

async function createStagingTables(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TEMP TABLE staging_footballers (
      qid text PRIMARY KEY,
      -- The numeric part, for the tie-break. Kept as a column rather than cast
      -- in the ORDER BY so that a qid that is not "Q<digits>" sorts last
      -- instead of aborting the import.
      qid_number bigint,
      name text NOT NULL,
      wiki_fr text,
      wiki_en text,
      sitelinks integer NOT NULL
    ) ON COMMIT DROP
  `)
  await client.query(`
    CREATE TEMP TABLE staging_names (
      qid text NOT NULL,
      term text NOT NULL,
      is_canonical boolean NOT NULL
    ) ON COMMIT DROP
  `)
}

/**
 * Streams both CSVs into the staging tables.
 *
 * A footballer's canonical name is staged as a term here, next to his aliases,
 * and terms that normalise to nothing — an alias of pure punctuation — are
 * dropped on the way in: an empty term would match every prefix query.
 */
async function stage(
  client: PoolClient,
  options: ReferentialImportOptions,
): Promise<{ footballers: number; aliases: number }> {
  const counts = { footballers: 0, aliases: 0 }
  const report = () => options.onProgress?.({ ...counts })

  const footballerBatch = new Batch(
    client,
    'staging_footballers',
    ['qid', 'qid_number', 'name', 'wiki_fr', 'wiki_en', 'sitelinks'],
    // The extract is de-duplicated on qid; a file that is not would silently
    // lose rows here, so it is refused below instead.
    'ON CONFLICT (qid) DO NOTHING',
  )
  const termBatch = new Batch(client, 'staging_names', ['qid', 'term', 'is_canonical'])

  for await (const row of readCsv(options.footballersCsv)) {
    counts.footballers += 1
    await footballerBatch.push([
      row.qid,
      wikidataNumber(row.qid),
      row.name,
      emptyToNull(row.wiki_fr),
      emptyToNull(row.wiki_en),
      Number.parseInt(row.sitelinks ?? '0', 10) || 0,
    ])
    await pushTerm(termBatch, row.qid, row.name, true)
    if (counts.footballers % 50_000 === 0) report()
  }
  await footballerBatch.flush()

  for await (const row of readCsv(options.aliasesCsv)) {
    counts.aliases += 1
    await pushTerm(termBatch, row.qid, row.alias, false)
    if (counts.aliases % 50_000 === 0) report()
  }
  await termBatch.flush()
  report()

  const { rows } = await client.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM staging_footballers',
  )
  const staged = Number(rows[0]?.count ?? 0)
  if (staged !== counts.footballers) {
    throw new Error(
      `${options.footballersCsv} holds the same Wikidata id more than once ` +
        `(${counts.footballers} rows read, ${staged} distinct). ` +
        'Fix the extract rather than letting the import pick a row.',
    )
  }

  return counts
}

/**
 * Stages a name, and then each of its words after the first.
 *
 * `nameSearchTerms` is the rule, and it lives in `shared/` because the career
 * import (#4) applies the same one to the footballers this import drops as
 * homonyms: measured on the real extract, Wikidata ships a "Papin" alias for
 * only 28 % of the multi-word footballers notorious enough to be scheduled
 * (802 of 2 890), so without the word terms a surname is not typeable at all.
 *
 * Duplicates — a word that is also an alias, "Zidane" — collapse on the unique
 * index, so nothing here has to know what already exists.
 */
async function pushTerm(
  batch: Batch,
  qid: string | undefined,
  value: string | undefined,
  isCanonical: boolean,
): Promise<void> {
  if (!qid) return

  for (const { term, isCanonical: canonical } of nameSearchTerms(value ?? '', isCanonical)) {
    await batch.push([qid, term, canonical])
  }
}

/**
 * Homonyms are de-duplicated here and nowhere else: for a given name only the
 * most notorious footballer enters, and the others do not enter at all
 * (docs/modele-donnees.md §3). Recovering a notable homonym is a manual insert.
 *
 * The tie-break on the lower Wikidata number is what makes the winner the same
 * on every run — without it, re-importing could swap two footballers who share
 * a name and a sitelink count, and the referential would drift.
 *
 * `NOT EXISTS` is the other half of that stability, and it is about the *second*
 * run rather than the first: whoever already holds a name keeps it, even if the
 * extract now says someone else is more notorious. Without it a shift in
 * notoriety would insert the new winner beside the old one — nothing here
 * deletes, and `name` carries no unique constraint — leaving two footballers
 * with the same name in the suggestions. Deleting the loser instead is not an
 * option: it would cascade to a `player_clubs` career an admin may have spent
 * an hour curating.
 */
async function upsertFootballers(client: PoolClient): Promise<number> {
  const { rowCount } = await client.query(`
    INSERT INTO footballers (wikidata_qid, name, wiki_fr_url, wiki_en_url, sitelinks)
    SELECT DISTINCT ON (name) qid, name, wiki_fr, wiki_en, sitelinks
    FROM staging_footballers s
    WHERE NOT EXISTS (
      SELECT 1 FROM footballers held
      WHERE held.name = s.name
        AND held.wikidata_qid IS DISTINCT FROM s.qid
    )
    ORDER BY name, sitelinks DESC, qid_number ASC NULLS LAST, qid ASC
    ON CONFLICT (wikidata_qid) DO UPDATE SET
      name = excluded.name,
      wiki_fr_url = excluded.wiki_fr_url,
      wiki_en_url = excluded.wiki_en_url,
      sitelinks = excluded.sitelinks,
      updated_at = now()
  `)
  return rowCount ?? 0
}

/**
 * The join on `wikidata_qid` is what drops the aliases of a homonym who did not
 * enter: nothing may point at a footballer who is not in the referential.
 *
 * `GROUP BY` collapses the accent variants Wikidata ships — "Zinédine Zidane"
 * and "Zinedine Zidane" are one term — and `bool_or` keeps that term canonical
 * when one of the variants was the canonical name.
 *
 * Nothing is deleted. A name that vanishes from the extract keeps its row: it is
 * still a name a player might type, and the import's job is to add what the
 * source now has, not to prune.
 */
async function upsertTerms(client: PoolClient): Promise<number> {
  const { rowCount } = await client.query(`
    INSERT INTO footballer_names (footballer_id, term, is_canonical)
    SELECT f.id, s.term, bool_or(s.is_canonical)
    FROM staging_names s
    JOIN footballers f ON f.wikidata_qid = s.qid
    GROUP BY f.id, s.term
    ON CONFLICT (footballer_id, term) DO UPDATE SET is_canonical = excluded.is_canonical
  `)
  return rowCount ?? 0
}

/** `Q1835` → `1835`, and null for anything else, which then sorts last. */
function wikidataNumber(qid: string | undefined): number | null {
  const digits = /^Q(\d+)$/.exec(qid ?? '')
  return digits ? Number(digits[1]) : null
}

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value
}

/**
 * Accumulates rows and flushes them as one multi-row INSERT.
 *
 * The column list is the only place the row width is written down, so the
 * placeholders cannot drift from the columns.
 */
class Batch {
  private readonly values: unknown[] = []
  private rows = 0

  constructor(
    private readonly client: PoolClient,
    private readonly table: string,
    private readonly columns: readonly string[],
    private readonly onConflict = '',
  ) {}

  async push(row: readonly unknown[]): Promise<void> {
    if (row.length !== this.columns.length) {
      // Otherwise every later value shifts one column left and Postgres
      // complains about the parameter count, 380 000 rows into the run.
      throw new Error(
        `${this.table}: ${row.length} values for ${this.columns.length} columns.`,
      )
    }

    this.values.push(...row)
    this.rows += 1
    if (this.rows >= BATCH_SIZE) await this.flush()
  }

  async flush(): Promise<void> {
    if (this.rows === 0) return

    const width = this.columns.length
    const tuples = Array.from({ length: this.rows }, (_, row) => {
      const placeholders = Array.from(
        { length: width },
        (_, column) => `$${row * width + column + 1}`,
      )
      return `(${placeholders.join(', ')})`
    })

    await this.client.query(
      `INSERT INTO ${this.table} (${this.columns.join(', ')})
       VALUES ${tuples.join(', ')} ${this.onConflict}`,
      this.values,
    )

    this.values.length = 0
    this.rows = 0
  }
}

/**
 * A CSV reader, streaming, RFC 4180 as far as the extract needs it: quoted
 * fields, `""` for a quote inside one, commas and newlines inside quotes, `\n`
 * or `\r\n` between records.
 *
 * Hand-written rather than a dependency because it is 30 lines and it is read by
 * the same person who reads the migrations. The case that makes it necessary is
 * real and in the data: Javier Hernández's French URL is
 * `..._(football,_1988)`, quoted, and splitting on every comma shifts every
 * column after it.
 */
async function* readCsv(
  path: string,
): AsyncGenerator<Partial<Record<string, string>>, void> {
  let header: string[] | undefined

  for await (const record of readCsvRecords(path)) {
    if (!header) {
      header = record
      continue
    }
    // A blank trailing line is not a record.
    if (record.length === 1 && record[0] === '') continue

    const row: Record<string, string> = {}
    header.forEach((column, index) => {
      row[column] = record[index] ?? ''
    })
    yield row
  }
}

async function* readCsvRecords(path: string): AsyncGenerator<string[], void> {
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let afterQuote = false
  let first = true

  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    for (const character of chunk as string) {
      if (first) {
        first = false
        if (character === '\uFEFF') continue
      }

      if (inQuotes) {
        if (character === '"') {
          inQuotes = false
          afterQuote = true
        } else {
          field += character
        }
        continue
      }

      if (afterQuote) {
        afterQuote = false
        // `""` inside a quoted field is one literal quote.
        if (character === '"') {
          field += '"'
          inQuotes = true
          continue
        }
      }

      if (character === '"') {
        inQuotes = true
      } else if (character === ',') {
        record.push(field)
        field = ''
      } else if (character === '\n') {
        record.push(field)
        yield record
        record = []
        field = ''
      } else if (character !== '\r') {
        field += character
      }
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field)
    yield record
  }
}
