import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pathKey, sourceFilesAt } from './tree'

/**
 * The fourth barrier, and the one this ticket adds: **the page of the daily
 * grid reads nothing that belongs to a request**.
 *
 * It is the central architectural decision of the project and it is one line
 * away from being lost. Reading a single cookie turns the whole route dynamic,
 * and two things break at once, neither of them loudly:
 *
 * - the origin takes the peak of midnight in full — possibly 20 000 people in
 *   five minutes (docs/stack-technique.md §10) — because a dynamic route is
 *   answered `private, no-store` and no CDN can hold it;
 * - a page that varies per visitor while a shared cache sits in front of it is
 *   how one player's hints end up on another player's screen. The page cannot
 *   leak what it cannot read, and that is the guarantee being protected here.
 *
 * So it is checked rather than remembered. The personal state of a player
 * arrives by a request of its own, after hydration (#8), and that request may
 * read whatever it likes: it is not this route.
 */
const ROOT = process.cwd()

/**
 * Everything the cached page is made of: its segment chain, the service it
 * awaits, and the components it renders.
 *
 * The root layout is in the list because it wraps the grid — a cookie read
 * there makes the route underneath dynamic just as surely as one read in the
 * page — and `grid.service.ts` is in it for the same reason one layer down:
 * the page awaits it, so a request read inside it opts the route out of
 * prerendering while the page itself still looks innocent.
 *
 * The list is deliberately *this* route and not the whole `(game)` group, nor
 * every module the page transitively imports. A sibling that legitimately needs
 * a request (the archive beyond seven days needs an account, #11) does not make
 * this page dynamic, and a guard that fires on innocent files is a guard people
 * switch off. Below the service, `server/domain` and `shared` carry their own
 * rule — "zéro import Next", README « Architecture » — and are shared with the
 * back-office, where reading a session is the whole point.
 */
const GUARDED = [
  'src/app/layout.tsx',
  'src/app/(game)/layout.tsx',
  'src/app/(game)/page.tsx',
  'src/server/services/grid.service.ts',
  'src/ui/game',
]

/**
 * What must not appear, and each of them is a request-time read.
 *
 * The patterns carry their punctuation so prose cannot trip them: this file and
 * the page itself both discuss cookies at length. Write *about* a cookie
 * freely; do not write the call.
 */
const REQUEST_TIME = [
  "from 'next/headers'",
  'cookies()',
  'headers()',
  'draftMode()',
  'connection()',
  // Search parameters are request data too: a page that accepts them opts the
  // route out of prerendering exactly as a cookie does. The grid takes none —
  // its whole state is the Paris date, which it computes.
  'searchParams',
]

const PAGE = 'src/app/(game)/page.tsx'

async function guardedFiles(): Promise<string[]> {
  const found = await Promise.all(
    GUARDED.map(async (entry) => await sourceFilesAt(join(ROOT, entry))),
  )
  return found.flat()
}

describe('the static grid barrier', () => {
  it('reads nothing that belongs to a request, anywhere in the cached route', async () => {
    const files = await guardedFiles()
    expect(files.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const pattern of REQUEST_TIME) {
        if (source.includes(pattern)) offenders.push(`${pathKey(ROOT, file)}: ${pattern}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the grid on a revalidation clock rather than on every request', async () => {
    const source = await readFile(join(ROOT, PAGE), 'utf8')

    // A number, so the route is prerendered and served with an `s-maxage` a CDN
    // can hold. `false` would cache the grid of the day for a year.
    expect(/^export const revalidate = \d+$/m.test(source)).toBe(true)
  })

  it('never forces the grid dynamic by segment config', async () => {
    const files = await guardedFiles()

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      // `dynamic = 'force-dynamic'` would undo the whole thing in five words,
      // and `dynamic` has no other value worth setting here.
      expect(source).not.toContain('export const dynamic')
    }
  })

  it('guards files that exist, so a rename cannot empty the list', async () => {
    // `(game)/layout.tsx` is allowed to be absent — there is none today — but
    // the rest are not: a path that stops matching anything after a move would
    // leave this test passing over nothing.
    for (const entry of [
      PAGE,
      'src/app/layout.tsx',
      'src/server/services/grid.service.ts',
      'src/ui/game',
    ]) {
      expect(await sourceFilesAt(join(ROOT, entry))).not.toEqual([])
    }
  })
})
