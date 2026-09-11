/**
 * Isomorphic career types — safe to import from anywhere, client included.
 *
 * Vocabulary (CONTEXT.md): a *passage* is one senior spell at one club, and a
 * *parcours* is the ordered sequence of them.
 *
 * Identifiers are in English (docs/modele-donnees.md) and mirror the table
 * names where there is one: a passage is a `PlayerClub`, after `player_clubs`.
 * A parcours has no table, so it is named from the glossary instead:
 * `FootballerCareer`, not `PlayerCareer` — CONTEXT.md flags `player` as the
 * ambiguous word for *footballeur*, and `players` is the table of people who
 * play the game.
 */

/**
 * Codepoint order, three ways.
 *
 * Not `localeCompare`: this orders identifiers and qids, where the only thing
 * asked of the order is that it be the same on every machine and every run.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}

/** One senior spell at one club. The same club crossed twice gives two of these. */
export type PlayerClub = {
  id: string
  clubId: string
  /** Current French name of the club — what the game displays. */
  clubName: string
  /**
   * The club's crest, by content address, or null when the catalogue has none.
   *
   * Next to the name because it is the same fact seen as an image, and it
   * travels wherever the name does: the parcours of an énigme shows it, and so
   * do the per-club hints, which would otherwise print bare names right under
   * a parcours that has crests. A key and never a URL — `crestUrl` in
   * `shared/club.ts` is the one place that knows where the bytes are served
   * from (ADR-0010).
   */
  crestKey: string | null
  /** An annotation next to the club, never a club of its own. */
  isLoan: boolean
  startYear: number
  /** Null = career in progress. */
  endYear: number | null
  /** League matches only. Null until an admin fills it in. */
  matches: number | null
  /** League goals only. Null until an admin fills it in. */
  goals: number | null
}

/**
 * The sort key of a career: the three fields its canonical order reads, and no
 * more.
 *
 * A career sorts by `(start_year, end_year, id)` (docs/modele-donnees.md §3),
 * so the ordering rule asks for exactly that. Which is what lets the daily grid
 * order a parcours from a query that never selects `matches` or `goals`: a
 * query cannot leak what it does not read.
 */
export type PlayerClubOrderKey = Pick<PlayerClub, 'id' | 'startYear' | 'endYear'>

export type Nationality = {
  id: string
  /** ISO 3166-1 alpha-2 — except for the nations and the dead countries that
   * carry no such code; see `server/ingest/nationality.ts`. */
  code: string
  frName: string
  /**
   * The flag, by content address — `null` until the seed has run, or after the
   * row it pointed at was deleted. `flagUrl` in `shared/nationality.ts` turns
   * it into the URL that serves it.
   */
  flagKey: string | null
}

/**
 * A footballer's ordered senior career, read straight from the catalogue.
 *
 * Nothing here is frozen at scheduling time: an enigma designates a footballer
 * and copies nothing from him (ADR-0001), so this is re-read on every render.
 *
 * This is catalogue data, not what a player is allowed to see. Which parts of
 * it reach the client, and when, is the reveal ladder's business.
 */
export type FootballerCareer = {
  footballerId: string
  name: string
  wikiFrUrl: string | null
  wikiEnUrl: string | null
  /** Null until an admin assigns one. Required to schedule the footballer. */
  nationality: Nationality | null
  /** In canonical order — see `comparePlayerClubs`. */
  playerClubs: PlayerClub[]
}
