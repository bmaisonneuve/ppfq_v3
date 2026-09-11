import 'server-only'

import { asc, eq, inArray } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { challengeItems, clubs, dailyChallenges, playerClubs } from '@/server/db/schema'
import { todayInParis } from '@/server/domain/challenge-calendar'
import { enigmaPassages } from '@/server/domain/enigma'
import type { EnigmaPassageRow } from '@/server/domain/enigma'
import { asPosition } from '@/shared/schedule'
import type { ChallengeDate } from '@/shared/schedule'
import type { DailyGrid, Enigma } from '@/shared/grid'

/**
 * La grille du jour, read for a player.
 *
 * ## Why this is not `schedule.service.ts`
 *
 * Both read `daily_challenges` and its three `challenge_items`, and there the
 * resemblance stops. The calendar reads the *name* of each footballer, which is
 * the answer, and lives behind `requireAdmin()`. This one reads the parcours
 * and never the name — not "reads it and does not print it": the query does not
 * select `footballers.name` at all, and there is no footballer identifier in
 * what it returns either. The page it feeds is rendered once a day and served
 * to every visitor from a shared cache, so the answer not being in the value is
 * the only form of "not leaking" that survives a caching layer.
 *
 * For the same reason the passage query never selects `matches` or `goals`:
 * they are hint tiers 4 and 5, and a column nobody reads cannot be rendered by
 * mistake. What each tier reveals is #9's business, over a request that carries
 * a player's identity — which this one never does.
 *
 * ## Nothing is copied
 *
 * An enigma designates a footballer and copies nothing from him (ADR-0001), so
 * the parcours is read here on every render. Correcting a career therefore
 * corrects every grid it appears in, and there is no snapshot to invalidate —
 * only the page cache, which turns over daily.
 *
 * ## No status gate
 *
 * A grid is read by its date and nothing else. `daily_challenges.status` exists
 * in the model but nothing in this application ever writes `draft` or
 * `published`: the programming screen writes `scheduled`, and the absence of a
 * row *is* the absence of a grid (docs/modele-donnees.md §4) — the same absence
 * the health route and the weekly alert (#14, #15) will read. Gating on a
 * publication step that nothing performs would mean a site that is empty every
 * day of the year.
 */

/**
 * The grid of today in Paris, or null when the day has no grid.
 *
 * Today is computed lazily, at read time, and never by a job: a grid date is a
 * Paris date, so the whole of "which day is it" is one `SELECT WHERE date =`
 * (docs/stack-technique.md §4). The turn of the grid at Paris midnight is
 * therefore this function's answer changing, and nothing else has to happen for
 * it — no publication, no cron, no timestamp comparison.
 *
 * What *is* time-sensitive is how long the rendered page is kept: see the
 * `revalidate` of `app/(game)/page.tsx`.
 */
export async function getDailyGrid(): Promise<DailyGrid | null> {
  return await getGridOfDate(todayInParis())
}

/**
 * The grid of one date, or null.
 *
 * Two queries and not a join of four tables: a grid names three footballers,
 * and a parcours is a dozen rows apiece. Joining the enigmas to the passages
 * would multiply the theme and the position across every club of every
 * footballer, and the reassembly costs more than the second round trip.
 *
 * Separate from `getDailyGrid` because "which day is it" and "read that day's
 * grid" are two rules, and only the first one has a clock in it: this half is
 * therefore assertable on a fixed date. The archive (#11) is the same read.
 */
export async function getGridOfDate(date: ChallengeDate): Promise<DailyGrid | null> {
  const rows = await db
    .select({
      theme: dailyChallenges.theme,
      position: challengeItems.position,
      footballerId: challengeItems.footballerId,
    })
    .from(dailyChallenges)
    // A left join, so a `daily_challenges` row whose enigmas are missing comes
    // back as a grid with no enigma rather than as no grid at all. The two are
    // different accidents and the page says different things about them.
    .leftJoin(challengeItems, eq(challengeItems.dailyChallengeId, dailyChallenges.id))
    .where(eq(dailyChallenges.date, date))
    .orderBy(asc(challengeItems.position))

  const [first] = rows
  if (first === undefined) return null

  const designations = rows.flatMap((row) => {
    const position = asPosition(row.position)
    if (position === null || row.footballerId === null) return []
    return [{ position, footballerId: row.footballerId }]
  })

  const passages = await readPassages(designations.map((d) => d.footballerId))

  return {
    date,
    theme: first.theme,
    enigmas: designations.map(
      (designation): Enigma => ({
        position: designation.position,
        passages: enigmaPassages(passages.get(designation.footballerId) ?? []),
      }),
    ),
  }
}

/**
 * The passages of the footballers of a grid, grouped by footballer.
 *
 * Unordered on purpose: the canonical order of a career is a domain rule and
 * `enigmaPassages` applies it, so no `ORDER BY` here can drift from what the
 * curation screen shows.
 */
async function readPassages(
  footballerIds: readonly string[],
): Promise<Map<string, EnigmaPassageRow[]>> {
  const grouped = new Map<string, EnigmaPassageRow[]>()
  if (footballerIds.length === 0) return grouped

  const rows = await db
    .select({
      id: playerClubs.id,
      footballerId: playerClubs.footballerId,
      // The current French name of the club, never the name of its time
      // (specs §11) — the only text a player is shown.
      clubName: clubs.frName,
      // The crest by content address, next to the name it belongs to: the
      // parcours is public whole, so its clubs may be read as images too. Null
      // when the catalogue has none, and the page draws the gap.
      crestKey: clubs.crestKey,
      isLoan: playerClubs.isLoan,
      startYear: playerClubs.startYear,
      endYear: playerClubs.endYear,
    })
    .from(playerClubs)
    .innerJoin(clubs, eq(clubs.id, playerClubs.clubId))
    .where(inArray(playerClubs.footballerId, [...footballerIds]))

  for (const { footballerId, ...passage } of rows) {
    const known = grouped.get(footballerId)
    if (known === undefined) grouped.set(footballerId, [passage])
    else known.push(passage)
  }

  return grouped
}
