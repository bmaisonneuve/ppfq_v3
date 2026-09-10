import 'server-only'

import { compareStrings } from '@/shared/career'
import type { PlayerClubOrderKey } from '@/shared/career'

/**
 * The canonical order of a career — a pure rule, no database, no Next.
 *
 * `player_clubs` has no ordering column on purpose: a career sorts by
 * `(start_year, end_year, id)` (docs/modele-donnees.md §3). Queries therefore
 * do not order — this function does, in one place, so every screen that reads a
 * career gets the same sequence.
 *
 * `id` is part of the key because the sequence of clubs *is* the enigma: two
 * spells starting and ending the same year must not swap between two page
 * loads. A spell still in progress (`endYear === null`) sorts last among those
 * starting the same year, which is where an ongoing career belongs.
 *
 * Corollary the admin has to live with: there is no drag & drop in the career
 * editor. Correcting an order means adjusting a year.
 *
 * It asks for `PlayerClubOrderKey` — the three fields it actually reads —
 * rather than a whole passage, so a caller may order a parcours it read without
 * its matches and its goals. The daily grid is that caller (`shared/grid.ts`).
 */
export function comparePlayerClubs(a: PlayerClubOrderKey, b: PlayerClubOrderKey): number {
  if (a.startYear !== b.startYear) return a.startYear - b.startYear

  const aEnd = a.endYear ?? Number.POSITIVE_INFINITY
  const bEnd = b.endYear ?? Number.POSITIVE_INFINITY
  if (aEnd !== bEnd) return aEnd - bEnd

  return compareStrings(a.id, b.id)
}

/**
 * `comparePlayerClubs` applied to a whole career. Returns a new array.
 *
 * Generic in the row rather than fixed to one shape, so a caller carrying more
 * than the order needs — the curation screen carries the club's English name —
 * gets its own rows back and not a narrowed copy.
 */
export function sortPlayerClubs<T extends PlayerClubOrderKey>(playerClubs: readonly T[]): T[] {
  return [...playerClubs].sort(comparePlayerClubs)
}
