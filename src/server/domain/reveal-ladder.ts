import 'server-only'

import { HINT_TIERS, MAX_TRIES } from '@/shared/play'
import type {
  HintClubLine,
  HintNationality,
  HintTier,
  PlayStatus,
  RevealedHint,
} from '@/shared/play'
import type { FootballerCareer, PlayerClub } from '@/shared/career'

import { sortPlayerClubs } from './career'

/**
 * L'échelle de dévoilement — a pure rule, no database, no Next.
 *
 * ## The ladder is derived, never stored
 *
 * `player_progress` has no `hints_revealed` column and must not grow one. The
 * number of hints a partie has earned *is* the number of erreurs it has made,
 * so storing it would be storing the same fact twice — and two copies of one
 * fact drift the first time an essai is written and a reveal is not. The whole
 * guarantee « une erreur dévoile exactement un indice, le suivant » is this
 * function being the only thing that decides.
 *
 * ## Five tiers for six essais
 *
 * The sixth erreur has no hint left to give: it gives the answer and ends the
 * partie (specs §3). That asymmetry is the reason `revealedTiers` saturates
 * rather than running to `MAX_TRIES`.
 *
 * ## It is handed the answer and must not give it back
 *
 * A `FootballerCareer` carries the footballer's name, because that is what the
 * catalogue holds and splitting it would only move the care elsewhere. So the
 * discipline is here and is asserted: nothing this module returns names the
 * footballer, and nothing returns a year of his career either — tier 1 gives a
 * decade and tier 2 gives a *count* of seasons, never the years that produced
 * it.
 */

/**
 * How many essais of a partie were erreurs.
 *
 * Everything spent counts — a wrong footballer, one already tried, a tour passé
 * (specs §3) — **except the essai that found the answer**. Without that
 * subtraction, finding the footballer on the second essai would reveal two
 * hints for one erreur, which is a tier given away for getting it right.
 */
export function errorsMade(play: { triesUsed: number; status: PlayStatus }): number {
  return play.status === 'solved' ? Math.max(0, play.triesUsed - 1) : play.triesUsed
}

/** Whether every essai is spent — what refuses the seventh, server-side. */
export function isExhausted(triesUsed: number): boolean {
  return triesUsed >= MAX_TRIES
}

/**
 * The tiers `errors` erreurs have paid for, in the specs' order.
 *
 * Saturating rather than throwing past five: the sixth erreur is a legitimate
 * state of a partie, and it is the one that ends it.
 */
export function revealedTiers(errors: number): HintTier[] {
  return HINT_TIERS.slice(0, Math.max(0, errors))
}

/**
 * The hints a partie has earned, whole, in order.
 *
 * Cumulative because a reload has to find them — « les informations dévoilées
 * restent affichées jusqu'à la fin de la partie » (specs §3) — and the page
 * they were on is thrown away every time the joueur refreshes. What keeps « un
 * seul indice, le suivant » true is that `errors` is what moves, one at a time.
 *
 * `currentYear` is handed in rather than read from a clock: this layer has
 * none, and a duration that changed with the machine's timezone would be a
 * different hint on two screens.
 */
export function revealedHints(args: {
  errors: number
  career: FootballerCareer
  currentYear: number
}): RevealedHint[] {
  const parcours = sortPlayerClubs(args.career.playerClubs)

  return revealedTiers(args.errors).map((tier) => hintAt(tier, args.career, parcours, args.currentYear))
}

/**
 * One tier, read off the catalogue.
 *
 * A `switch` over the union rather than a lookup table, so adding a tier is a
 * compile error here and at every screen that renders one.
 */
function hintAt(
  tier: HintTier,
  career: FootballerCareer,
  parcours: readonly PlayerClub[],
  currentYear: number,
): RevealedHint {
  switch (tier) {
    case 1:
      return { tier, decade: startDecade(parcours) }
    case 2:
      return { tier, durations: lines(parcours, (p) => seasons(p, currentYear)) }
    case 3:
      return { tier, nationality: nationalityHint(career) }
    case 4:
      return { tier, matches: lines(parcours, (p) => p.matches) }
    case 5:
      return { tier, goals: lines(parcours, (p) => p.goals) }
  }
}

/**
 * The decade the career started in, rounded down — 1988 gives 1980.
 *
 * Null for a parcours with no passage at all. Such a footballer is not
 * schedulable (`no-career`, `shared/schedule.ts`), and is reachable all the
 * same: an enigma designates a footballer and copies nothing from him
 * (ADR-0001), so an import that replaces a parcours can empty one under a grid
 * already published. Saying "unknown" beats printing the decade of year zero.
 */
function startDecade(parcours: readonly PlayerClub[]): number | null {
  const first = parcours[0]
  if (first === undefined) return null

  return Math.floor(first.startYear / 10) * 10
}

/**
 * A passage's length in seasons: `end_year - start_year + 1`.
 *
 * 2015-2015 is one season and 2015-2016 is two — an approximation, and an
 * assumed one (CONTEXT.md). A passage still open counts up to the current
 * season, which is what « the displayed duration then keeps growing »
 * (`server/db/schema.ts`) means.
 *
 * Floored at one season, because `end_year >= start_year` is a *scheduling*
 * predicate and not a promise about the future: an import may write a negative
 * span under an enigma already published, and "-2 saisons" on a hint is worse
 * than the approximation it replaces.
 */
function seasons(passage: PlayerClub, currentYear: number): number {
  const end = passage.endYear ?? currentYear
  return Math.max(1, end - passage.startYear + 1)
}

/** The nationality as a hint shows it — never its identifier. */
function nationalityHint(career: FootballerCareer): HintNationality | null {
  const nationality = career.nationality
  if (nationality === null) return null

  return { frName: nationality.frName, flagKey: nationality.flagKey }
}

/** One line per passage, in career order, carrying the club and one figure. */
function lines(
  parcours: readonly PlayerClub[],
  figure: (passage: PlayerClub) => number | null,
): HintClubLine[] {
  return parcours.map((passage) => ({
    clubName: passage.clubName,
    crestKey: passage.crestKey,
    figure: figure(passage),
  }))
}
