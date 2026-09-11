/**
 * La grille du jour: what a player is given, and the whole of it.
 *
 * These types are the shape of the cached page. Every field here is public by
 * construction — three parcours, their loan annotations and the theme of the
 * day — and the fields that are *not* here are the point of the file: no
 * footballer name, no identifier, no year, no nationality, no matches, no
 * goals, no personal state. The HTML of the grid is rendered once a day and
 * served to everyone from a shared cache (docs/stack-technique.md §10), so a
 * hint that reached this type would leak to every player at once. Nothing here
 * can leak because nothing here is secret.
 *
 * That is also why this is a type of its own next to `ScheduledEnigma`, which
 * looks close and is the opposite: the programming calendar reads the name of
 * each footballer, which is the answer, and it is behind `requireAdmin()`.
 */
import type { ChallengeDate, Position } from './schedule'

/**
 * One passage as the enigma poses it: the club, and whether it was a loan.
 *
 * A loan is an annotation next to the club and never a club of its own
 * (CONTEXT.md), which is why this is a flag on the passage rather than a
 * different kind of row.
 */
export type EnigmaPassage = {
  /** Current French name of the club — never the name of its time (specs §11). */
  clubName: string
  isLoan: boolean
  /**
   * The club's crest, by content address, or null when the catalogue has none.
   *
   * Public like the rest of this type, and for the same reason: the parcours is
   * shown whole, so the crest of a club already named reveals nothing a player
   * cannot read on the line next to it. Null is an image missing, not a hole —
   * a club with no crest is a club whose name stands alone, which is what the
   * grid did for every club before this.
   *
   * A key and never a URL: `crestUrl` in `shared/club.ts` is the one place that
   * knows where the bytes are served from (ADR-0010).
   */
  crestKey: string | null
}

/**
 * One of the three enigmas of a grid, as it is posed.
 *
 * The parcours **is** the enigma and it is shown whole from the start (specs
 * §3): the number of clubs is therefore visible from the first second, by
 * construction and not by choice. Identified by its position, because
 * `(date, position)` names an enigma without naming a row — the daily grid has
 * no identifier of its own to give the client.
 */
export type Enigma = {
  position: Position
  /** In career order, holes and repeats included. */
  passages: EnigmaPassage[]
}

/**
 * A day's grid: its theme, and its enigmas in position order.
 *
 * `theme` is free text and is announced as it was typed (specs §4): the code
 * writes `standard` on its own and classifies nothing.
 */
export type DailyGrid = {
  date: ChallengeDate
  theme: string
  enigmas: Enigma[]
}
