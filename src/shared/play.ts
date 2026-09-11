/**
 * La partie, as it travels between the server and the joueur's screen.
 *
 * This is the personal half of the game, and it is the exact complement of
 * `shared/grid.ts`: that file is the shape of a page rendered once a day and
 * served to everybody from a shared cache, this one is the shape of an answer
 * that belongs to one person and must never be cached anywhere (ADR-0009). The
 * two travel separately for that reason alone.
 *
 * What is absent from it is the point, and the rule is one sentence: **a partie
 * never carries more than it has earned**. The hints it holds are exactly the
 * tiers its erreurs paid for, and the name of the footballer appears only once
 * the partie is over. Everything an onlooker could read in a network tab is
 * therefore something the joueur has already been shown on screen.
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
 * *rule* reads this same constant on the server: `isExhausted` in
 * `server/domain/reveal-ladder.ts` is written on it, and `submitTry` in
 * `server/services/play.service.ts` is what refuses the seventh essai by it —
 * so the count on screen and the count enforced can never disagree.
 */
export const MAX_TRIES = 6

/**
 * The rank of a hint on the ladder — the order is the specs' table (§3) and it
 * is not negotiable.
 *
 * Five tiers for six essais: the sixth erreur has no hint left to give, and
 * gives the answer instead.
 */
export type HintTier = 1 | 2 | 3 | 4 | 5

/** The ladder, in order. Five, one short of `MAX_TRIES`, on purpose. */
export const HINT_TIERS: readonly HintTier[] = [1, 2, 3, 4, 5]

/**
 * What each tier is called on screen.
 *
 * Tiers 4 and 5 say **« en championnat »** and that is a rule rather than a
 * caption (specs §3): the source counts neither the domestic cups nor the
 * European competitions, so Messi at Barcelona is 520 matchs and 474 buts,
 * which is the Liga alone. Without the words, a joueur who knows his figures
 * reads the hint as a mistake — and on a hint, confidence is worth more than
 * precision.
 */
export const HINT_LABELS: Record<HintTier, string> = {
  1: 'Décennie de début',
  2: 'Durée par club',
  3: 'Nationalité',
  4: 'Matchs en championnat',
  5: 'Buts en championnat',
}

/** The nationality as a hint shows it: the name and its flag, never the id. */
export type HintNationality = {
  frName: string
  /** Null when the nationality has no flag yet — an image missing, not a hole. */
  flagKey: string | null
}

/**
 * One club's line of a per-club hint.
 *
 * The club name travels with the figure rather than the client aligning two
 * lists by index. Free — the parcours is public and already on screen — and it
 * is what keeps a hint readable on its own instead of depending on the order
 * of a list rendered somewhere else.
 */
export type HintClubLine = {
  clubName: string
  /**
   * The club's crest, exactly as the parcours of the grid carries it.
   *
   * Public, and the same value the cached page already holds: the club is
   * named on this very line, so its image adds nothing to what the hint gives
   * away. It is here so a hint reads like the parcours it sits under, rather
   * than like a second list that lost its pictures.
   */
  crestKey: string | null
  /**
   * Seasons, matchs or buts, depending on the tier. Null only for tiers 4 and
   * 5, where the catalogue may simply not know — an admin cannot schedule such
   * a footballer (`shared/schedule.ts`), but an import may empty a column after
   * the fact.
   */
  figure: number | null
}

/**
 * One revealed hint, the only shape a hint ever travels in.
 *
 * A union over the tier rather than five optional fields, so a client that
 * renders a hint has to say which tier it is rendering, and so a tier added
 * later is a compile error everywhere it matters.
 */
export type RevealedHint =
  | { tier: 1; decade: number | null }
  | { tier: 2; durations: HintClubLine[] }
  | { tier: 3; nationality: HintNationality | null }
  | { tier: 4; matches: HintClubLine[] }
  | { tier: 5; goals: HintClubLine[] }

/**
 * One joueur's partie on one enigma of a grid.
 *
 * Named by its `position` and not by an identifier: `(date, position)` names an
 * enigma without naming a row, exactly as in `shared/grid.ts`, and the cached
 * page has no row identifier to hand the client in the first place.
 *
 * This is the whole of what the server ever says about a partie — the state
 * answer and the essai answer are both exactly this. One shape rather than
 * two, because two would be two chances to let a hint out early.
 */
export type EnigmaPlay = {
  position: Position
  /** Everything spent: a wrong footballer, one already tried, a skipped turn. */
  triesUsed: number
  status: PlayStatus
  /**
   * The tiers this partie has paid for, in order, and never one more.
   *
   * Cumulative rather than incremental, because a reload has to find them:
   * « les informations dévoilées restent affichées jusqu'à la fin de la
   * partie » (specs §3), and the page they were on is thrown away every time
   * the joueur refreshes. What guarantees « une erreur dévoile exactement un
   * indice, le suivant » is therefore not the wire format but the ladder:
   * `server/domain/reveal-ladder.ts` derives this list from the erreurs made,
   * so an answer with six hints in it is a partie with six erreurs on it.
   */
  hints: RevealedHint[]
  /**
   * The footballer's name — **null for as long as the partie is playable**.
   *
   * The constraint the whole ticket exists for (specs §10.1): the answer never
   * leaves the server before the end. `null` is not "we did not include it", it
   * is the field being absent from the value, the same way `shared/grid.ts`
   * has no name in it at all.
   */
  answer: string | null
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
 * Where an essai is played — a proposition, or a tour passé.
 *
 * One door for both, because they are one gesture in the model: « passer
 * consomme un essai, exactement comme une erreur » (specs §3), and the doublon
 * takes the same path. A second endpoint for skipping would be a second place
 * to get the ladder wrong.
 */
export const GAME_TRY_PATH = '/api/game/try'

/**
 * The window in which the *same* proposition is ignored — **anti-double-click,
 * not a game rule** (`docs/stack-technique.md` §4).
 *
 * The two are opposites and are easy to confuse: proposing a footballer already
 * tried *costs* an essai (specs §10), while the same proposition arriving twice
 * in two seconds costs nothing, because it is one click that the browser sent
 * twice.
 *
 * Beside `MAX_TRIES` rather than inside the service because it is a number the
 * game is *defined* by and not a tuning knob: it belongs with the six essais,
 * where both are read by name instead of being written out again. The interface
 * holds the other half of the same guard and holds it differently — a button
 * disabled while an essai is in flight (`ui/game/enigma-essai.tsx`) — because a
 * disabled button is a suggestion and this is the protection.
 */
export const DOUBLE_SUBMIT_MS = 2000

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
