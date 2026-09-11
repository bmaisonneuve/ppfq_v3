import 'server-only'

import { isGridOfDay } from '@/shared/play'
import type { ChallengeDate, Position } from '@/shared/schedule'
import type { EnigmaPlay, PlayMode, PlayStatus } from '@/shared/play'
import type { FootballerCareer } from '@/shared/career'

import { errorsMade, revealedHints } from './reveal-ladder'

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

/**
 * A stored partie as the joueur is allowed to read it.
 *
 * One function, because the three things it decides are one decision and
 * getting any of them right separately is worth nothing:
 *
 * - the **status** is read and not taken from the column (above);
 * - the **hints** are exactly the tiers the erreurs paid for, derived by the
 *   ladder and stored nowhere (`reveal-ladder.ts`);
 * - the **answer** appears only once the partie is over — which is the whole of
 *   specs §10.1, and the reason it is computed from the status that was just
 *   read rather than from the one in the row. A partie the day took away is
 *   over, and its answer is no longer a secret.
 *
 * `career` is allowed to be absent, and that absence is not a degraded mode: a
 * partie with nothing spent on it has no hint and no answer to give, so the
 * caller is *right* not to have read the catalogue for it. `needsCareer` below
 * is the same rule seen from the caller's side, and the two have to agree.
 *
 * The year the durations are counted against comes from `today` rather than
 * from a clock: this layer has none, and a partie read twice in one second must
 * not answer two different things.
 */
export function readPlay(args: {
  play: { position: Position; triesUsed: number; status: PlayStatus; mode: PlayMode }
  gridDate: ChallengeDate
  /** The catalogue's view of the footballer — undefined when none was read. */
  career: FootballerCareer | undefined
  today: ChallengeDate
}): EnigmaPlay {
  const status = readPlayStatus({ ...args.play, gridDate: args.gridDate }, args.today)
  const { position, triesUsed } = args.play

  if (args.career === undefined) return { position, triesUsed, status, hints: [], answer: null }

  return {
    position,
    triesUsed,
    status,
    hints: revealedHints({
      errors: errorsMade({ triesUsed, status }),
      career: args.career,
      currentYear: yearOf(args.today),
    }),
    answer: status === 'in_progress' ? null : args.career.name,
  }
}

/**
 * Whether reading this partie needs the catalogue at all.
 *
 * The reason it is a rule and not an `if` inside a query: **the overwhelming
 * majority of parties are read with nothing spent on them**. A partie is born
 * when the enigma is opened (`docs/modele-donnees.md` §4), so the request that
 * opens one asks about a partie with no erreur, no hint and no answer — and at
 * the minute of the peak that is nearly every request there is. This is what
 * lets that request answer without reading a footballer's name anywhere.
 *
 * It says yes for a partie that is over even with nothing spent: a grid that
 * turned under an untouched partie is a failure, and a failure shows its
 * answer.
 */
export function needsCareer(
  play: { triesUsed: number; status: PlayStatus; mode: PlayMode },
  gridDate: ChallengeDate,
  today: ChallengeDate,
): boolean {
  const status = readPlayStatus({ ...play, gridDate }, today)
  return status !== 'in_progress' || errorsMade({ triesUsed: play.triesUsed, status }) > 0
}

/** The year of a Paris date. Four characters, and no `Date` to mis-zone. */
function yearOf(date: ChallengeDate): number {
  return Number(date.slice(0, 4))
}
