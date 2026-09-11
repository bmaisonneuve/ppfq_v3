/**
 * The flag seed: one rendered image per row of `nationalities`, stored in
 * `nationality_flags` and pointed at by `nationalities.flag_key`.
 *
 * ## Why this is tooling and not a service
 *
 * The same reason `referential.ts` is: it is a bootstrap that reads files from
 * disk once, at deploy time, like a migration. It also depends on `sharp`, and
 * `sharp` has no business being reachable from the application — keeping the
 * renderer in `scripts/` is what makes "no image processing dependency in the
 * app" true rather than aspirational. The application only ever *reads* a flag,
 * through `services/flag.service.ts`.
 *
 * ## Where the images come from
 *
 * **`flag-icons`** (MIT, Panayiotis Lipiridis — see `node_modules/flag-icons/LICENSE`),
 * whose set of codes is exactly the one `server/ingest/nationality.ts` produces:
 * ISO 3166-1 alpha-2 for the countries, and `gb-eng`, `gb-sct`, `gb-wls`,
 * `gb-nir` for the four British nations that are the whole point of preferring
 * `P1532` to `P27`. It carries `gb-nir` as the Ulster Banner, which is the
 * convention football uses and which no ISO source would give.
 *
 * Wikidata's own `P41` was the obvious candidate and is a trap: it is
 * multi-valued and historical, so France answers with ten flags whose first is
 * a mediaeval banner, Czechoslovakia answers with "Flag of the Czech
 * Republic.svg", and Northern Ireland answers with nothing at all. Choosing
 * among them needs qualifier logic whose failure mode is a wrong flag — and a
 * wrong flag is a false enigma, where a missing one only makes a footballer
 * unschedulable (`docs/modele-donnees.md` §3).
 *
 * The countries that no longer exist are the gap: `YUG`, `CSK` and `SUN` are
 * codes flag-icons has never heard of, and they are precisely the nationalities
 * a retro grid wants. They sit in `scripts/flags/` as public-domain SVGs taken
 * from Wikimedia Commons. `csk.svg` being byte-identical to the Czech flag is
 * the historical fact — Czechia kept the Czechoslovak flag — and not a mistake.
 *
 * ## What it never overwrites
 *
 * A nationality that already has a `flag_key` is left alone, like every other
 * curated field of the row: an import never rewrites a nationality, and the
 * admin's correction has to survive the next run. `overwrite` is the deliberate
 * way past that, for the day the source is upgraded.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PoolClient } from 'pg'
import sharp from 'sharp'

import { FLAG_HEIGHT, FLAG_WIDTH, MAX_FLAG_BYTES } from '../src/shared/nationality.ts'

import { withPool } from './db.ts'

/**
 * Rasterised at four times the stored width before being scaled down. The
 * sources are vector and their diagonals are the whole difficulty — the Czech
 * triangle, the Yugoslav star — so rendering large and resampling down is what
 * keeps those edges clean. It costs milliseconds on 274 files.
 */
const RENDER_DENSITY = 300

/** `flag-icons` states its own licence; this is what travels with the bytes. */
const FLAG_ICONS_LICENSE = 'flag-icons (MIT)'

/** What the three hand-added files are, and the only claim made about them. */
const OVERRIDE_LICENSE = 'domaine public (Wikimedia Commons)'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Overrides sit here and win over the package — the way a wrong flag is fixed. */
const OVERRIDES_DIR = join(HERE, 'flags')

export type FlagSeedOptions = {
  connectionString: string
  /** Replaces the flag of a nationality that already has one. Off by default. */
  overwrite?: boolean
}

export type FlagSeedReport = {
  /** Rows in `nationalities` — the seed only ever fills in what imports created. */
  nationalitiesRead: number
  /** Nationalities whose `flag_key` this run set. */
  linked: number
  /** Left alone because they already had a flag and `overwrite` was off. */
  alreadyLinked: number
  /** Rows this run added to `nationality_flags`; a shared flag is stored once. */
  flagsStored: number
  /** Codes with no source file, in the order they were met. Named, never guessed. */
  missing: string[]
  /** Codes whose rendering came out above `MAX_FLAG_BYTES`. Not stored. */
  oversized: string[]
}

/**
 * Fills in every flag it can and reports every one it cannot.
 *
 * One transaction: a half-seeded set of flags is not dangerous, but it makes
 * the report a lie, and the report is the only thing that says which countries
 * still need an admin.
 */
export async function seedFlags(options: FlagSeedOptions): Promise<FlagSeedReport> {
  return await withPool(options.connectionString, async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const report = await seedWithinTransaction(client, options.overwrite ?? false)
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

async function seedWithinTransaction(
  client: PoolClient,
  overwrite: boolean,
): Promise<FlagSeedReport> {
  const rows = await readNationalities(client)

  const report: FlagSeedReport = {
    nationalitiesRead: rows.length,
    linked: 0,
    alreadyLinked: 0,
    flagsStored: 0,
    missing: [],
    oversized: [],
  }

  for (const row of rows) {
    if (row.hasFlag && !overwrite) {
      report.alreadyLinked += 1
      continue
    }

    const source = await readSource(row.code)
    if (source === null) {
      report.missing.push(row.code)
      continue
    }

    const flag = await render(source.svg)
    if (flag.bytes.byteLength > MAX_FLAG_BYTES) {
      report.oversized.push(row.code)
      continue
    }

    const stored = await storeFlag(client, flag, source)
    if (stored) report.flagsStored += 1

    await client.query('UPDATE nationalities SET flag_key = $1 WHERE id = $2', [flag.key, row.id])
    report.linked += 1
  }

  return report
}

type NationalityRow = { id: string; code: string; hasFlag: boolean }

async function readNationalities(client: PoolClient): Promise<NationalityRow[]> {
  const { rows } = await client.query<{ id: string; code: string; has_flag: boolean }>(
    'SELECT id, code, flag_key IS NOT NULL AS has_flag FROM nationalities ORDER BY code',
  )
  return rows.map((row) => ({ id: row.id, code: row.code, hasFlag: row.has_flag }))
}

type FlagSource = { svg: Buffer; sourceFile: string; license: string }

/**
 * The source file for a code, overrides first.
 *
 * The code is lower-cased and nothing else: `FR` is `fr.svg`, `GB-ENG` is
 * `gb-eng.svg`, and the alpha-3 of a country that no longer exists is whatever
 * an override provides. A code with neither is not an error here — it is a line
 * in the report and a country an admin has to deal with.
 */
async function readSource(code: string): Promise<FlagSource | null> {
  const name = `${code.toLowerCase()}.svg`

  const override = await readIfPresent(join(OVERRIDES_DIR, name))
  if (override !== null) {
    return { svg: override, sourceFile: `scripts/flags/${name}`, license: OVERRIDE_LICENSE }
  }

  const packaged = await readIfPresent(join(flagIconsDir(), name))
  if (packaged !== null) {
    return { svg: packaged, sourceFile: `flag-icons/${name}`, license: FLAG_ICONS_LICENSE }
  }

  return null
}

async function readIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    // Anything but "it is not there" is a real failure — an unreadable file
    // must not be reported as a country the source does not cover.
    if (isNotFound(error)) return null
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

let flagIconsDirCache: string | null = null

/** Resolved through Node rather than spelled out, so the path survives a hoist. */
function flagIconsDir(): string {
  if (flagIconsDirCache === null) {
    const manifest = createRequire(import.meta.url).resolve('flag-icons/package.json')
    flagIconsDirCache = resolve(dirname(manifest), 'flags', '4x3')
  }
  return flagIconsDirCache
}

type RenderedFlag = { key: string; bytes: Buffer; contentType: string }

/**
 * One SVG to the bytes that are stored, and the address they are stored under.
 *
 * Lossless and lossy are both encoded and the smaller kept. That is not
 * hedging: a tricolour is flat colour, where lossless WebP wins by an order of
 * magnitude — France comes out at 88 bytes — while a flag carrying a coat of
 * arms is a photograph as far as the encoder is concerned, and Serbia goes from
 * a 182 kB SVG to 4 kB only because the lossy branch exists.
 */
async function render(svg: Buffer): Promise<RenderedFlag> {
  const base = sharp(svg, { density: RENDER_DENSITY }).resize(FLAG_WIDTH, FLAG_HEIGHT, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })

  const [lossless, lossy] = await Promise.all([
    base.clone().webp({ lossless: true, effort: 6 }).toBuffer(),
    base.clone().webp({ quality: 92, effort: 6 }).toBuffer(),
  ])

  const bytes = lossless.byteLength <= lossy.byteLength ? lossless : lossy

  return {
    key: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    contentType: 'image/webp',
  }
}

/** Returns whether the row was new: two nationalities may share a flag. */
async function storeFlag(
  client: PoolClient,
  flag: RenderedFlag,
  source: FlagSource,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO nationality_flags (key, bytes, content_type, byte_size, source_file, license)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO NOTHING`,
    [flag.key, flag.bytes, flag.contentType, flag.bytes.byteLength, source.sourceFile, source.license],
  )
  return rowCount === 1
}
