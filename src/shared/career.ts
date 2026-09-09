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

/** One senior spell at one club. The same club crossed twice gives two of these. */
export type PlayerClub = {
  id: string
  clubId: string
  /** Current French name of the club — what the game displays. */
  clubName: string
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

export type Nationality = {
  id: string
  /** ISO 3166-1 alpha-2. */
  code: string
  frName: string
  flagS3Key: string | null
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
