import 'server-only'

import { isGridOfDay } from '@/shared/play'
import type { ChallengeDate } from '@/shared/schedule'
import type { PlayMode, PlayStatus } from '@/shared/play'

/**
 * La partie, as a rule rather than as a row — pure, no database, no Next.
 *
 * There is one rule here and it is the one the model insists on calling a
 * **reading** rule: « une partie non terminée avant le changement de grille
 * compte comme un échec », *par règle de lecture et non par un job*
 * (`docs/modele-donnees.md` §4).
 *
 * The job is the thing being refused. Closing every partie left open would mean
 * a pass over every row of the day at Paris midnight, which is the exact minute
 * of the traffic peak — 20 000 people in five minutes
 * (`docs/stack-technique.md` §10) — to write a status two dates already imply.
 * So nothing writes it, the row goes on saying `in_progress`, and this function
 * is the only place that turns the day having passed into a failure.
 */

/**
 * The status of a partie as it must be read, which is not always as it is
 * stored.
 *
 * Three lines, and each one is a decision:
 *
 * - a **finished** partie is never contradicted. Everything ever solved sits on
 *   a grid that is no longer the grid of the day, so a rule written on the date
 *   alone would turn every past success into a failure;
 * - an **archive** partie has no deadline. It is played on a grid that is not
 *   the day's by definition, and it is allowed precisely because it counts for
 *   nothing (specs §7). The clock belongs to the quotidien;
 * - a **daily** partie still open on any other day than its own is a failure.
 *   The corollary the joueur sees: la grille du jour is not picked up the next
 *   morning — it has become archive, and the archive does not count.
 */
export function readPlayStatus(
  play: { status: PlayStatus; mode: PlayMode; gridDate: ChallengeDate },
  today: ChallengeDate,
): PlayStatus {
  if (play.status !== 'in_progress') return play.status
  if (play.mode === 'archive') return 'in_progress'

  return isGridOfDay(play.gridDate, today) ? 'in_progress' : 'failed'
}
