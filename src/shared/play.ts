/**
 * La partie, as it travels between the server and the joueur's screen.
 *
 * This is the personal half of the game, and it is the exact complement of
 * `shared/grid.ts`: that file is the shape of a page rendered once a day and
 * served to everybody from a shared cache, this one is the shape of an answer
 * that belongs to one person and must never be cached anywhere (ADR-0009). The
 * two travel separately for that reason alone.
 *
 * What is deliberately absent is the same thing that is absent from the grid,
 * and for a stronger reason: **no footballer, no name, no identifier, no hint**.
 * A partie says how many essais have been spent and how it ended, and nothing a
 * network tab could turn into an answer. Revealing the answer at the end of a
 * partie is #9's business, over the request that ends it.
 */
import type { ChallengeDate, Position } from './schedule'

/**
 * The frame a partie is played in — `play_mode` in the database.
 *
 * Only `daily` feeds the série and the cartons pleins (specs §7). Declared here
 * rather than derived from the Drizzle enum, which lives on the server and
 * cannot be imported by client code; the two are held together by `tsc` at
 * `play.service.ts`, which assigns one to the other.
 */
export type PlayMode = 'daily' | 'archive'

/**
 * The issue of a partie — `play_status` in the database.
 *
 * Read rather than stored, and the difference matters: a partie left open on a
 * grid that is no longer the grid of the day is *read* as `failed` while the
 * row still says `in_progress`. `server/domain/play.ts` holds that rule, and no
 * job anywhere writes it (`docs/modele-donnees.md` §4).
 */
export type PlayStatus = 'in_progress' | 'solved' | 'failed'

/**
 * Six essais per enigma (specs §3).
 *
 * Here because the display needs a denominator: a partie that showed
 * "3 essais sur 5" would be a bug nobody could see in a screenshot. The
 * *rule* is not here and is not yet anywhere — the seventh essai is refused
 * server-side by #9, and this is the constant it will read rather than repeat.
 */
export const MAX_TRIES = 6

/**
 * One joueur's partie on one enigma of a grid.
 *
 * Named by its `position` and not by an identifier: `(date, position)` names an
 * enigma without naming a row, exactly as in `shared/grid.ts`, and the cached
 * page has no row identifier to hand the client in the first place.
 */
export type EnigmaPlay = {
  position: Position
  /** Everything spent: a wrong footballer, one already tried, a skipped turn. */
  triesUsed: number
  status: PlayStatus
}

/**
 * Everything personal about one grid, in one answer.
 *
 * `plays` holds only the enigmas the joueur has actually opened — a partie is
 * born on opening (`docs/modele-donnees.md` §4), so an enigma he has never
 * unfolded is *absent* rather than present with zero essais. That absence is
 * the measure of the people exposed to an enigma, which is what the difficulty
 * calibration reads (#12), and it is the reason the three enigmas do not unfold
 * at once.
 *
 * `today` is in the answer because the page may be older than the day: it is
 * prerendered and served from a shared cache for up to a minute (ADR-0008), so
 * a joueur arriving at midnight can hold a grid that has just turned. The
 * server says which day it is; the client is in no position to know.
 */
export type DayPlays = {
  /** The grid this state is about — the date the client asked about. */
  date: ChallengeDate
  /** Today in Paris, as the server sees it. */
  today: ChallengeDate
  plays: EnigmaPlay[]
}

/** Where the personal state is asked for. One definition, both sides. */
export const GAME_STATE_PATH = '/api/game/state'

/**
 * Whether a grid is still the grid of the day.
 *
 * Two dates and one `===`, and it earns a name because three layers ask the
 * question for three different reasons and must not drift: the domain reads an
 * unfinished partie as a failure when it is false
 * (`server/domain/play.ts`), the service refuses to *open* one
 * (`server/services/play.service.ts`), and the interface offers to reload
 * (`ui/game/use-day-plays.ts`). Isomorphic because the last of those runs in a
 * browser.
 *
 * Neither side ever asks a clock. Both dates are Europe/Paris dates the server
 * computed: a page can be a minute older than the day (ADR-0008), and a browser
 * has no way of knowing it.
 */
export function isGridOfDay(date: ChallengeDate, today: ChallengeDate): boolean {
  return date === today
}

/**
 * A partie in the words the joueur reads, one line.
 *
 * A partie lost with two essais spent and one lost with six say the same thing:
 * the grid taking a partie away is not a performance, and the count would only
 * invite the joueur to work out what happened.
 */
export function describePlay(play: EnigmaPlay): string {
  switch (play.status) {
    case 'in_progress':
      return `${essais(play.triesUsed)} sur ${MAX_TRIES}`
    case 'solved':
      return `Trouvé en ${essais(play.triesUsed)}`
    case 'failed':
      return 'Échoué'
  }
}

/** French, so zero is singular: « 0 essai », « 1 essai », « 2 essais ». */
const essais = (count: number) => `${count} essai${count > 1 ? 's' : ''}`
