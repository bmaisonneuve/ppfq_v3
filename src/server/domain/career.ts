import 'server-only'

import type { PlayerClub } from '@/shared/career'

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
 */
export function comparePlayerClubs(a: PlayerClub, b: PlayerClub): number {
  if (a.startYear !== b.startYear) return a.startYear - b.startYear

  const aEnd = a.endYear ?? Number.POSITIVE_INFINITY
  const bEnd = b.endYear ?? Number.POSITIVE_INFINITY
  if (aEnd !== bEnd) return aEnd - bEnd

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** `comparePlayerClubs` applied to a whole career. Returns a new array. */
export function sortPlayerClubs(playerClubs: readonly PlayerClub[]): PlayerClub[] {
  return [...playerClubs].sort(comparePlayerClubs)
}
