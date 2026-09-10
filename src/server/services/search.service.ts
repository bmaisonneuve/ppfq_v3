import 'server-only'

import { and, asc, desc, eq, exists, sql } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { footballerNames, footballers } from '@/server/db/schema'
import {
  DEFAULT_SUGGESTION_LIMIT,
  MAX_SUGGESTION_LIMIT,
  MIN_SEARCH_LENGTH,
  normalizeSearchTerm,
} from '@/shared/search'
import type { FootballerSuggestion } from '@/shared/search'

/**
 * The typeahead: the only input in the game, and the reason an essai is always
 * an existing footballer.
 *
 * Canonical names and aliases share one table, so this is one query over an
 * index rather than a union — and a suggestion always carries
 * `footballers.name`, so the alias that matched is never shown.
 *
 * The table also holds each word of a name after the first, derived at import,
 * which is what makes a surname typeable on its own: the prefix index is
 * anchored at the start of a term, and `papin` would otherwise reach
 * "Jean-Pierre Papin" only through an alias Wikidata ships for 28 % of the
 * footballers notorious enough to be scheduled.
 *
 * ## Two indexes, and only one of them on the hot path
 *
 * The prefix is the dominant case and it is the whole hot path: this is the
 * most-hit endpoint of the site, ~35 requests per player (docs/stack-technique.md
 * §10). Trigrams are a *rescue*, and they run only when the prefix found
 * nothing at all — which is exactly when the player has made a typo, and never
 * when he is halfway through a name that exists.
 *
 * That rule is what keeps the cost flat. A rescue that also fired on "found a
 * few" would make a correctly typed full name — one prefix match — pay for a
 * GIN scan and a similarity sort on every keystroke. Its price is narrow and
 * known: a typo that happens to be a valid prefix of some obscure name ("zizu")
 * gets that obscure name and no rescue.
 *
 * ## Why the prefix query is written inside out
 *
 * The obvious shape — join names to footballers, group, sort by notoriety — has
 * to aggregate every name matching the prefix before it can rank anything, and
 * two letters match tens of thousands of them: 117 ms on the real extract.
 * Asking instead for *footballers, in ranked order, that have a matching name*
 * lets Postgres walk `footballers_ranking_idx` and stop at the tenth match:
 * 0.8 ms. On a rare prefix it flips to the term index and sorts the handful it
 * finds. Both plans are index-only, and the planner picks between them on the
 * selectivity of the prefix.
 */

/**
 * Below this, trigrams say nothing: a three-letter query is similar to no
 * longer name at all, so the rescue would cost a GIN scan and return noise.
 */
const FUZZY_MIN_LENGTH = 4

/**
 * pg_trgm's default threshold is 0.3, which sits just above a *transposition* —
 * `similarity('zidane', 'zidnae')` is 0.27 — so two swapped letters in a
 * six-letter surname would go unrescued. 0.25 catches it.
 *
 * It is set transaction-locally rather than on the database or the role: the
 * threshold decides what the game finds, so it belongs in code a reader can
 * see, not in a server setting a restore could quietly drop.
 */
const SIMILARITY_THRESHOLD = '0.25'

export async function searchFootballers(input: {
  query: string
  limit?: number
}): Promise<FootballerSuggestion[]> {
  const term = normalizeSearchTerm(input.query)
  if (term.length < MIN_SEARCH_LENGTH) return []

  const limit = Math.min(input.limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT)

  const byPrefix = await matchByPrefix(term, limit)
  if (byPrefix.length > 0 || term.length < FUZZY_MIN_LENGTH) return byPrefix

  return await matchByTrigram(term, limit)
}

/**
 * The hot path.
 *
 * `term` is normalised, and normalisation keeps only letters and digits, so
 * there is no `%`, `_` or `\` left to escape in the pattern.
 *
 * `exists` is also what makes a footballer appear once however many of his
 * terms match — "zi" catches four of Zidane's — without a `GROUP BY`.
 */
async function matchByPrefix(term: string, limit: number): Promise<FootballerSuggestion[]> {
  const prefix = `${term}%`
  const hasMatchingTerm = db
    .select({ matched: sql`1` })
    .from(footballerNames)
    .where(
      and(
        eq(footballerNames.footballerId, footballers.id),
        sql`${footballerNames.term} like ${prefix}`,
      ),
    )

  return await db
    .select({ footballerId: footballers.id, name: footballers.name })
    .from(footballers)
    .where(exists(hasMatchingTerm))
    .orderBy(...byNotoriety)
    .limit(limit)
}

/**
 * The rescue: similarity to the nearest tenth, then notoriety.
 *
 * Neither half of that is enough on its own, measured on the real referential:
 *
 * - By notoriety alone, `javier hernadez` buries Javier Hernández under Javier
 *   Milei and Javier Mascherano, who share enough trigrams to be candidates and
 *   are far more notorious.
 * - By similarity alone, a crowd of unknown near-misses ranks above the famous
 *   name a player was plainly aiming at.
 *
 * Rounding to a tenth reconciles them: matches that are equally good are
 * separated by fame, while a clearly better match still wins. `javier
 * hernadez`, `ronaldiho`, `mbape` and `zinedien zidane` all then put the
 * intended footballer first.
 *
 * What it does *not* do is override a genuinely nearer name. `zidnae` ranks
 * Djibril Zidnaba (0.50) and Miroslav Žitnjak (0.36) above Zidane (0.30),
 * because those really are closer to what was typed; Zidane comes third of ten,
 * which is what the criterion asks for — the typo returns him — and tuning past
 * that would mean a scoring function this ticket has no way to validate.
 *
 * That notoriety carries so much weight here is particular to this branch: a
 * correctly spelled name always has a prefix match, so anything reaching the
 * rescue is a *misspelling*, and a misspelling of a famous footballer is far
 * likelier than an exact hit on an obscure one.
 *
 * It aggregates where the prefix path uses `exists`, because a footballer can
 * match on several terms and `GROUP BY` is what collapses him back to one row
 * here. It can afford to: it only runs when the prefix came back empty.
 */
async function matchByTrigram(term: string, limit: number): Promise<FootballerSuggestion[]> {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('pg_trgm.similarity_threshold', ${SIMILARITY_THRESHOLD}, true)`,
    )

    return await tx
      .select({ footballerId: footballers.id, name: footballers.name })
      .from(footballerNames)
      .innerJoin(footballers, eq(footballers.id, footballerNames.footballerId))
      // `%` is the only trigram operator the GIN index serves; it reads the
      // threshold set just above.
      .where(sql`${footballerNames.term} % ${term}`)
      .groupBy(footballers.id, footballers.name, footballers.sitelinks)
      .orderBy(
        sql`round(max(similarity(${footballerNames.term}, ${term}))::numeric, 1) desc`,
        ...byNotoriety,
      )
      .limit(limit)
  })
}

/**
 * Notoriety, then name, then id — the exact shape of `footballers_ranking_idx`.
 *
 * Notoriety is the ranking rule (specs §3). The other two are there to make the
 * sequence *repeatable*: two footballers on the same sitelinks must not swap
 * between two keystrokes, or the player clicks the row that moved.
 */
const byNotoriety = [
  desc(footballers.sitelinks),
  asc(footballers.name),
  asc(footballers.id),
] as const
