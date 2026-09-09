import 'server-only'

import type { PlayerClub } from '@/shared/career'
import type { CuratedPassage, FlaggedPassage, PassageFlag } from '@/shared/curation'

import { sortPlayerClubs } from './career'

/**
 * The two curation aids of `docs/stack-technique.md` §6, as pure rules.
 *
 * Both exist for the same reason: the source cannot answer the question, so the
 * admin has to — and the editor's job is to put the question in front of him,
 * never to answer it for him.
 */

/**
 * Label fragments that suggest a reserve team, from the measurement in
 * `docs/research/wikidata-coverage.md` §4.3 (signal C, the best of the three).
 *
 * The measurement is the whole point: reserve teams are typed as ordinary
 * senior clubs — `FC Barcelona C` is `P31 = association football club` and
 * nothing else — and the three structural signals together reach only 1,4 to
 * 1,6 % of club passages, while the real prevalence is certainly far higher.
 * The label is all there is, and it is *noisy*: "Paris Saint-Germain Féminine"
 * and "Örgryte IS Fotboll" are measured false positives of the other signals,
 * and this one has its own.
 *
 * Hence the contract of this function: it flags, and the admin deletes. Nothing
 * in this codebase may delete a passage on its strength.
 *
 * The measurement was made on **English** labels, and the game displays
 * `clubs.fr_name`, so both names are tried. The shapes that matter — a roman
 * numeral, a trailing letter, `Jong`, an age group — survive the translation;
 * the words do not, so both spellings are listed.
 */
const RESERVE_LABEL_PATTERNS: readonly RegExp[] = [
  /* A roman numeral or a single letter at the end: "Bayern Munich II", "Real
     Sociedad B", "FC Barcelone C". Anchored at the end and preceded by a space,
     so "Levante UD" and "Botafogo" are untouched. */
  / (?:I{2,3}|B|C)$/,
  /* Named reserves that carry no numeral. `Atlètic` with its Catalan grave
     accent is Barcelona's reserve; `Atlético`, a different word, is not. */
  /\bcastilla\b/i,
  /\batlètic\b/i,
  /\bamateure\b/i,
  /* French and English, singular and plural. */
  /\br[ée]serves?\b/i,
  /* The Dutch prefix: "Jong Ajax", "Jong PSV". */
  /^jong /i,
  /* Age groups, hyphenated or not: U21, U-18, U23. */
  /\bu-?(?:1\d|2\d)\b/i,
  /\byouth\b/i,
]

/**
 * Whether a club's name reads like a reserve team.
 *
 * Every name the catalogue has for the club is tried, and the English one is
 * not optional: the measurement was made on English labels, and a French name
 * can lose the marker its English counterpart carries. `clubs.en_name` exists
 * in the model precisely as the admin's fallback.
 *
 * A hint for the eye, never a decision. See `RESERVE_LABEL_PATTERNS` for why
 * there is nothing better available, and why acting on it automatically would
 * silently drop real senior passages.
 */
export function isLikelyReserveTeam(...clubNames: readonly (string | null)[]): boolean {
  return clubNames.some(
    (name) => name !== null && RESERVE_LABEL_PATTERNS.some((pattern) => pattern.test(name)),
  )
}

/**
 * Whether two passages share years — the one case where the order of a parcours
 * is genuinely ambiguous, and therefore the one worth an alert.
 *
 * A **handover** is not an overlap. One spell ending the year the next begins
 * is the ordinary shape of a career — Cannes 1988-1992 then Bordeaux 1992-1996
 * — and a rule that flagged it would flag every footballer and mean nothing.
 * The transfer happened that summer; the years simply meet.
 *
 * The exclusion is narrow, and its limit is what the third clause is for: it
 * applies only when the two spells *pass* each other. A spell **nested** inside
 * another — 1990-1992 alongside 1992-1992 — shares its one year without any
 * handover having happened, and is exactly the loan-inside-a-contract shape the
 * alert exists for. So nesting wins over the handover reading, and so does a
 * shared start year or a shared end year.
 *
 * What is left is what the admin actually has to look at: a loan sitting inside
 * its parent contract (legitimate, and the reason the order needs reading), a
 * passage the source duplicated, or two clubs the source disagrees about.
 *
 * An open spell (`endYear === null`) runs to infinity, so anything starting
 * after it overlaps it — a career in progress cannot have been followed by
 * another club — and two open spells overlap each other.
 *
 * The rule is `docs/adr/0007-un-chevauchement-n-est-pas-une-passation.md`.
 */
export function passagesOverlap(a: PlayerClub, b: PlayerClub): boolean {
  const aEnd = a.endYear ?? Number.POSITIVE_INFINITY
  const bEnd = b.endYear ?? Number.POSITIVE_INFINITY

  // No year in common at all.
  if (aEnd < b.startYear || bEnd < a.startYear) return false

  // A shared boundary is never a handover: neither spell got out of the way.
  if (a.startYear === b.startYear || aEnd === bEnd) return true

  const sharedFrom = Math.max(a.startYear, b.startYear)
  const sharedTo = Math.min(aEnd, bEnd)

  // More than one year in common: an overlap, whatever the shape.
  if (sharedFrom !== sharedTo) return true

  // Exactly one year in common — a handover, unless one spell sits inside the
  // other, in which case nobody handed over to anybody.
  const nested =
    (a.startYear <= b.startYear && bEnd <= aEnd) ||
    (b.startYear <= a.startYear && aEnd <= bEnd)

  return nested
}

/**
 * The parcours as the curation screen reads it: in career order, each passage
 * carrying what the admin should look at.
 *
 * Recomputed on every read and stored nowhere. There is no curation status in
 * this project (`docs/modele-donnees.md` §10) — these flags are a view of the
 * rows as they are, so an edit that fixes one makes it disappear with no second
 * write to forget.
 *
 * Ordering is `sortPlayerClubs`, the same rule every other screen uses: the
 * sequence of clubs is the enigma, and the editor must show the sequence the
 * player will see. It is also why there is no drag & drop — correcting an order
 * means adjusting a year.
 */
export function flagPassages(passages: readonly CuratedPassage[]): FlaggedPassage[] {
  const ordered = sortPlayerClubs(passages)

  return ordered.map((passage, index) => {
    const flags: PassageFlag[] = []

    if (isLikelyReserveTeam(passage.clubName, passage.clubEnName)) {
      flags.push('likely-reserve')
    }

    const overlaps = ordered.some(
      (other, otherIndex) => otherIndex !== index && passagesOverlap(passage, other),
    )
    if (overlaps) flags.push('overlap')

    if (passage.matches === null || passage.goals === null) flags.push('missing-figures')

    return { ...passage, flags }
  })
}
