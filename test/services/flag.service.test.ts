import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { GET } from '@/app/api/flags/[key]/route'
import { readFlag } from '@/server/services/flag.service'
import { pool } from '@test/setup/db'

/**
 * The read path of a flag: the service that fetches the bytes, and the route
 * that answers with them.
 *
 * The route is in here rather than in a file of its own because it is an
 * adapter with exactly one interesting behaviour — what it *refuses* — and that
 * behaviour only means anything against the real table the service reads. Its
 * two guards are the whole reason it is worth a test: a key that is not a hash
 * must never reach Postgres, and a stored content type that is not on the
 * allow-list must never be served whatever the database says.
 */
const BYTES = Buffer.from('pretend this is a WebP')
const KEY = createHash('sha256').update(BYTES).digest('hex')

async function storeFlag(contentType = 'image/webp'): Promise<void> {
  await pool.query(
    `INSERT INTO nationality_flags (key, bytes, content_type, byte_size)
     VALUES ($1, $2, $3, $4)`,
    [KEY, BYTES, contentType, BYTES.byteLength],
  )
}

/** The route takes its params as a promise, the way Next hands them over. */
async function get(key: string): Promise<Response> {
  return await GET(new Request(`http://localhost/api/flags/${key}`), {
    params: Promise.resolve({ key }),
  })
}

describe('readFlag', () => {
  beforeEach(async () => {
    await storeFlag()
  })

  it('returns the bytes exactly as they were stored', async () => {
    const flag = await readFlag(KEY)

    expect(flag?.contentType).toBe('image/webp')
    // A `bytea` round trip that mangles a byte would make every flag on the
    // site a broken image, and nothing else in the suite would notice.
    expect(flag?.bytes.equals(BYTES)).toBe(true)
  })

  it('answers null for a key nothing is stored under', async () => {
    expect(await readFlag(createHash('sha256').update('absent').digest('hex'))).toBeNull()
  })
})

describe('the flag route', () => {
  it('serves the bytes as an image that may be cached for ever', async () => {
    await storeFlag()

    const response = await get(KEY)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(Buffer.from(await response.arrayBuffer()).equals(BYTES)).toBe(true)

    // `immutable` is only honest because the key is the content address.
    const cache = response.headers.get('Cache-Control')
    expect(cache).toContain('immutable')
    expect(cache).toContain('max-age=31536000')
  })

  it('refuses a key that is not a SHA-256 without asking the database', async () => {
    for (const key of ['../../etc/passwd', 'FR', KEY.toUpperCase(), `${KEY}0`]) {
      expect((await get(key)).status).toBe(404)
    }
  })

  it('answers 404 for a key nothing is stored under', async () => {
    expect((await get(createHash('sha256').update('absent').digest('hex'))).status).toBe(404)
  })

  it('refuses to serve a stored type that is not on the allow-list', async () => {
    // The store is written by a script today. This is the barrier that survives
    // a future writer: an SVG served from our own origin is executable markup,
    // and being in the database is not a reason to trust it.
    await storeFlag('image/svg+xml')

    expect((await get(KEY)).status).toBe(404)
  })
})
