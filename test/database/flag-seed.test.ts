import { createHash } from 'node:crypto'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { seedFlags } from '../../scripts/flags.ts'
import type { FlagSeedReport } from '../../scripts/flags.ts'

import { FLAG_HEIGHT, FLAG_WIDTH } from '@/shared/nationality'
import { pool } from '@test/setup/db'

/**
 * The flag seed: a rendered image per nationality, stored under the SHA-256 of
 * its own bytes.
 *
 * Tooling rather than a service — it runs under plain Node from a CLI, like the
 * referential import (see the header of `scripts/flags.ts`) — so it is tested
 * here next to the migration check rather than on the service seam.
 *
 * It really renders, through the real `sharp` and the real `flag-icons` files.
 * A double would leave the one thing worth checking untested: that what lands
 * in `bytea` is a decodable image of the right shape, and that the key it is
 * filed under is the hash of exactly those bytes.
 */

/** The three codes that stand for the three shapes the seed has to handle. */
const CODES = {
  /** Plain alpha-2, straight out of the package. */
  france: { code: 'FR', frName: 'France' },
  /** The subdivision code of a nation the package carries and ISO does not. */
  england: { code: 'GB-ENG', frName: 'Angleterre' },
  /** Alpha-3 of a dead country: only `scripts/flags/` has it. */
  yugoslavia: { code: 'YUG', frName: 'Yougoslavie' },
  /** Nothing anywhere. Named in the report, never guessed at. */
  nowhere: { code: 'ZZ', frName: 'Pays imaginaire' },
} as const

async function insertNationalities(
  ...rows: readonly { code: string; frName: string }[]
): Promise<void> {
  for (const row of rows) {
    await pool.query('INSERT INTO nationalities (code, fr_name) VALUES ($1, $2)', [
      row.code,
      row.frName,
    ])
  }
}

async function seed(options: { overwrite?: boolean } = {}): Promise<FlagSeedReport> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set for the test run.')
  }
  return await seedFlags({ connectionString: url, ...options })
}

type FlagRow = {
  code: string
  flag_key: string | null
  bytes: Buffer | null
  content_type: string | null
  byte_size: number | null
  source_file: string | null
  license: string | null
}

async function flagOf(code: string): Promise<FlagRow> {
  const { rows } = await pool.query<FlagRow>(
    `SELECT n.code, n.flag_key, f.bytes, f.content_type, f.byte_size, f.source_file, f.license
     FROM nationalities n
     LEFT JOIN nationality_flags f ON f.key = n.flag_key
     WHERE n.code = $1`,
    [code],
  )
  const [row] = rows
  if (row === undefined) throw new Error(`No nationality ${code}.`)
  return row
}

describe('seedFlags', () => {
  it('stores a decodable WebP of the right shape, under the hash of its bytes', async () => {
    await insertNationalities(CODES.france)

    const report = await seed()
    expect(report).toMatchObject({ nationalitiesRead: 1, linked: 1, flagsStored: 1, missing: [] })

    const row = await flagOf('FR')
    expect(row.content_type).toBe('image/webp')
    expect(row.source_file).toBe('flag-icons/fr.svg')
    expect(row.license).toBe('flag-icons (MIT)')

    const bytes = row.bytes
    expect(bytes).not.toBeNull()
    if (bytes === null) return

    // The key *is* the content address. A seed that filed the bytes under
    // anything else would serve a 404 for every flag, and only this catches it.
    expect(row.flag_key).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(row.byte_size).toBe(bytes.byteLength)

    const meta = await sharp(bytes).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([FLAG_WIDTH, FLAG_HEIGHT])
  })

  it('dresses the four British nations, which are the point of the code scheme', async () => {
    await insertNationalities(CODES.england)

    await seed()

    expect(await flagOf('GB-ENG')).toMatchObject({ source_file: 'flag-icons/gb-eng.svg' })
  })

  it('takes a dead country from scripts/flags, which the package has never heard of', async () => {
    await insertNationalities(CODES.yugoslavia)

    const report = await seed()
    expect(report.missing).toEqual([])

    const row = await flagOf('YUG')
    expect(row.source_file).toBe('scripts/flags/yug.svg')
    expect(row.license).toBe('domaine public (Wikimedia Commons)')

    // A 2:1 flag fitted into the 4:3 box, not stretched to it: the box is the
    // stored size, and the star inside it is still round.
    const meta = await sharp(row.bytes ?? Buffer.alloc(0)).metadata()
    expect([meta.width, meta.height]).toEqual([FLAG_WIDTH, FLAG_HEIGHT])
  })

  it('names the codes it has no image for instead of inventing one', async () => {
    await insertNationalities(CODES.france, CODES.nowhere)

    const report = await seed()

    expect(report.missing).toEqual(['ZZ'])
    expect(report.linked).toBe(1)
    expect((await flagOf('ZZ')).flag_key).toBeNull()
  })

  it('leaves a flag an admin already set alone, and replaces it only on request', async () => {
    await insertNationalities(CODES.france)
    await seed()

    // Curation, standing in for an admin who fixed the flag by hand.
    const curated = Buffer.from('not really an image, and that is the point')
    const curatedKey = createHash('sha256').update(curated).digest('hex')
    await pool.query(
      `INSERT INTO nationality_flags (key, bytes, content_type, byte_size)
       VALUES ($1, $2, 'image/webp', $3)`,
      [curatedKey, curated, curated.byteLength],
    )
    await pool.query(`UPDATE nationalities SET flag_key = $1 WHERE code = 'FR'`, [curatedKey])

    const untouched = await seed()
    expect(untouched).toMatchObject({ linked: 0, alreadyLinked: 1 })
    expect((await flagOf('FR')).flag_key).toBe(curatedKey)

    const forced = await seed({ overwrite: true })
    expect(forced).toMatchObject({ linked: 1, alreadyLinked: 0 })
    expect((await flagOf('FR')).flag_key).not.toBe(curatedKey)
  })

  it('is a no-op the second time, so it can follow any import without thinking', async () => {
    await insertNationalities(CODES.france, CODES.england)

    const first = await seed()
    const second = await seed()

    expect(first).toMatchObject({ linked: 2, flagsStored: 2 })
    expect(second).toMatchObject({ linked: 0, alreadyLinked: 2, flagsStored: 0 })
  })
})
