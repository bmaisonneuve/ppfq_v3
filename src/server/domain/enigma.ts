import 'server-only'

import type { PlayerClubOrderKey } from '@/shared/career'
import type { EnigmaPassage } from '@/shared/grid'

import { sortPlayerClubs } from './career'

/**
 * L'énigme telle qu'elle est posée — a pure rule, no database, no Next.
 *
 * The parcours *is* the enigma: it is shown whole from the first second, and
 * what reveals itself try by try is the peripheral information — the decade,
 * the durations, the nationality, the figures (specs §1). So posing an enigma
 * is one operation: order the passages, keep the club and its loan annotation,
 * **drop everything else**.
 *
 * That last step is the reason this is a function and not a `map` inside a
 * query. The page of the grid is rendered once a day and served to everyone
 * from a shared cache, so a hint that reached the HTML would reach every player
 * at once, whatever their number of tries. Here the years, the matches and the
 * goals are not omitted from a display: they are not in the value. A cached
 * page that *cannot* carry a hint is stronger than one that happens not to.
 */

/**
 * A passage as the grid query reads it: what orders it, and what it shows.
 *
 * The sort key rather than a whole `PlayerClub`, so the query behind this never
 * selects `matches` or `goals` — and the shown half is `EnigmaPassage` itself,
 * so the two fields a player sees are declared in one place.
 */
export type EnigmaPassageRow = PlayerClubOrderKey & EnigmaPassage

/** One footballer's passages, posed as the enigma the player reads. */
export function enigmaPassages(passages: readonly EnigmaPassageRow[]): EnigmaPassage[] {
  return sortPlayerClubs(passages).map(({ clubName, isLoan }) => ({ clubName, isLoan }))
}
