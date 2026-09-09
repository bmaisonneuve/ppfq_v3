import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The second barrier: `import 'server-only'` at the top of every file under
 * `src/server/`. It is what makes the *build* fail — not merely the lint — when
 * a client component reaches across the boundary (docs/stack-technique.md §3).
 *
 * A rule nobody applies is not a barrier, and the marker is a single line that
 * is easy to forget on a new file. So it is checked rather than remembered.
 */
const SERVER_ROOT = join(process.cwd(), 'src', 'server')

/**
 * The one documented exception. drizzle-kit reads the schema from plain Node to
 * generate migrations, and `server-only` throws outside a React Server
 * Component graph. Nothing is lost: the layering rule still forbids
 * `app/** -> server/db/**`.
 *
 * Everything else that needs to run under plain Node — the migration runner,
 * the pool helpers — lives in `scripts/`, outside `src/` entirely.
 */
const EXEMPT = new Set(['db/schema.ts'])

async function serverFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return serverFiles(full)
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
    }),
  )
  return found.flat()
}

describe('the server-only barrier', () => {
  it('marks every file under src/server, except the documented exception', async () => {
    const files = await serverFiles(SERVER_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const unmarked: string[] = []
    for (const file of files) {
      const key = relative(SERVER_ROOT, file).split(sep).join('/')
      if (EXEMPT.has(key)) continue
      const source = await readFile(file, 'utf8')
      if (!/^import 'server-only'$/m.test(source)) unmarked.push(key)
    }

    expect(unmarked).toEqual([])
  })

  it('still exempts only what is documented as exempt', async () => {
    // If an exemption is added, it has to be added here too — which is the
    // moment to ask whether it really cannot carry the marker.
    const files = await serverFiles(SERVER_ROOT)
    const keys = files.map((f) => relative(SERVER_ROOT, f).split(sep).join('/'))

    for (const exempt of EXEMPT) {
      expect(keys).toContain(exempt)
    }
  })
})
