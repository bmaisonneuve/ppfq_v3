import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * Walking the source tree, once, for the guards that read it.
 *
 * Three of the four barriers work the same way — take a root, list every
 * TypeScript file under it, read each one, look for a line that has to be
 * there. The walk itself was written three times before it was written here;
 * what each guard *looks for* is what makes it a different test, not how it
 * finds its files.
 */

/** Every `.ts` and `.tsx` file under `dir`, recursively. */
export async function sourceFilesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return await sourceFilesUnder(full)
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
    }),
  )
  return found.flat()
}

/**
 * The source files at a path, whether it names one file or a directory — and
 * nothing at all when it names neither.
 *
 * A guard that lists paths by hand needs the third answer: a file that may
 * legitimately not exist yet is not the same thing as a path that stopped
 * matching after a rename, and only the guard knows which of the two it is
 * looking at.
 */
export async function sourceFilesAt(path: string): Promise<string[]> {
  const stats = await stat(path).catch(() => null)
  if (stats === null) return []
  if (stats.isDirectory()) return await sourceFilesUnder(path)

  return [path]
}

/** A file as the guards name it: relative to their root, slash-separated. */
export function pathKey(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}
