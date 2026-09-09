import 'server-only'

import type { FootballerCareer, PlayerClub } from '@/shared/career'
import { EARLIEST_PLAUSIBLE_START_YEAR } from '@/shared/schedule'
import type { FootballerSchedulability, ScheduleObstacle } from '@/shared/schedule'

import { sortPlayerClubs } from './career'

/**
 * Whether a footballer can carry an enigma — a pure rule, no database, no Next.
 *
 * This is the blocking control of `docs/modele-donnees.md` §4, and it is
 * blocking for one reason worth restating every time someone is tempted to
 * soften it: a hint tier reads a column **at the moment it is revealed**. A
 * null there is a blank screen at try four or five, with four tries already
 * spent and no way back for the player. The cost of refusing is that an admin
 * goes and fills a field; the cost of accepting is a broken game for a day.
 *
 * Two families, and they are not the same claim:
 *
 * - **Completeness** — nationality, matches, goals. Without them a tier is
 *   empty. This is what the ticket is about.
 * - **Plausibility** — the three predicates the model measures in the source
 *   (2 989 passages with more goals than matches, 181 ending before they begin,
 *   131 starting before 1880). These do not empty a tier, they make the enigma
 *   wrong.
 *
 * Nothing is rejected at import: the search referential stays exhaustive, and a
 * footballer with doubtful data stays a valid suggestion — he simply becomes
 * unschedulable. And this is a check **at scheduling time, not a guarantee over
 * time**: nothing stops a later import from emptying a field of an enigma
 * already published (ADR-0001).
 *
 * What it deliberately does not test is whether the parcours is **true**. A
 * career can be complete and false by omission — Cantona's seven passages are
 * all complete and his Marseille years are simply absent — and no query detects
 * it. The only guard is the admin's eye on the curation screen, and it is
 * neither traced nor required by the model.
 */

/**
 * Everything standing between one footballer and a grid, in the order the admin
 * will fix it: what is true of the man first, then his passages in career
 * order.
 *
 * Every obstacle is reported, never just the first: the admin leaves this
 * screen to go and edit, and a refusal that reveals one hole at a time costs
 * him a round trip per field.
 */
export function assessSchedulability(career: FootballerCareer): FootballerSchedulability {
  const obstacles: ScheduleObstacle[] = []

  if (career.playerClubs.length === 0) {
    obstacles.push({ code: 'no-career', clubName: null })
  }

  // Hint 3. One nationality even for a dual national, so a missing one is a
  // missing tier and nothing else can stand in for it.
  if (career.nationality === null) {
    obstacles.push({ code: 'missing-nationality', clubName: null })
  }

  // Career order, the same rule every screen uses: the refusal reads in the
  // sequence the admin sees on the curation screen he is about to open.
  for (const passage of sortPlayerClubs(career.playerClubs)) {
    obstacles.push(...passageObstacles(passage))
  }

  return {
    footballerId: career.footballerId,
    name: career.name,
    obstacles,
  }
}

/**
 * The obstacles of one passage, club named.
 *
 * `matches` and `goals` are read as "is the figure there", not "is it above
 * zero": zero is a real, different fact — a defender with no league goal — and
 * only null empties hint 5.
 */
function passageObstacles(passage: PlayerClub): ScheduleObstacle[] {
  const obstacles: ScheduleObstacle[] = []
  const at = (code: ScheduleObstacle['code']): ScheduleObstacle => ({
    code,
    clubName: passage.clubName,
  })

  if (passage.matches === null || passage.goals === null) {
    obstacles.push(at('missing-figures'))
  } else if (passage.goals > passage.matches) {
    // Only comparable once both are there; the missing figure is already said.
    obstacles.push(at('goals-above-matches'))
  }

  // A null `end_year` is a career in progress, not a passage ending in the
  // past: it runs to infinity and can never precede its own start.
  if (passage.endYear !== null && passage.endYear < passage.startYear) {
    obstacles.push(at('end-before-start'))
  }

  if (passage.startYear < EARLIEST_PLAUSIBLE_START_YEAR) {
    obstacles.push(at('start-before-1880'))
  }

  return obstacles
}
