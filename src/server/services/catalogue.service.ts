import 'server-only'

import { eq, inArray } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { clubs, footballers, nationalities, playerClubs } from '@/server/db/schema'
import { sortPlayerClubs } from '@/server/domain/career'
import type { FootballerCareer, PlayerClub } from '@/shared/career'

/**
 * Reads footballers' careers from the catalogue.
 *
 * Services are the only way in: routing, Route Handlers and worker tasks call
 * this, and none of them touches `db/` or `domain/` itself.
 *
 * The rows come back unordered and `sortPlayerClubs` puts them in order. The
 * ordering rule lives in the domain rather than in an `ORDER BY` so that every
 * screen reading a career gets the same sequence from one definition; a career
 * is a dozen rows, so the sort costs nothing.
 *
 * This returns catalogue data, **not what a joueur may see**. Which parts of it
 * reach him, and after how many erreurs, is the reveal ladder's job
 * (`server/domain/reveal-ladder.ts`) — and the name sitting in plain sight here
 * is exactly what that layer exists to keep out of an answer.
 */

/** One footballer's career, or null when the catalogue has no such row. */
export async function getFootballerCareer(
  footballerId: string,
): Promise<FootballerCareer | null> {
  const careers = await getFootballerCareers([footballerId])
  return careers.get(footballerId) ?? null
}

/**
 * The careers of several footballers at once, by identifier.
 *
 * Two queries whatever the count, and that is the whole reason this exists
 * beside the singular read: the essai needs a career on every call, and the
 * personal state of a grid needs up to three of them at the minute of the peak
 * — 20 000 people in five minutes (`docs/stack-technique.md` §10). Three round
 * trips per request, to answer with the same rows, is the sort of thing that
 * only looks free until the day it is not.
 *
 * A footballer with no passage is **present with an empty parcours** rather
 * than absent: the two are different accidents, and the hint ladder says
 * different things about them.
 */
export async function getFootballerCareers(
  footballerIds: readonly string[],
): Promise<Map<string, FootballerCareer>> {
  const careers = new Map<string, FootballerCareer>()
  if (footballerIds.length === 0) return careers

  const ids = [...new Set(footballerIds)]

  const rows = await db
    .select({ footballer: footballers, nationality: nationalities })
    .from(footballers)
    .leftJoin(nationalities, eq(nationalities.id, footballers.nationalityId))
    .where(inArray(footballers.id, ids))

  if (rows.length === 0) return careers

  const passages = await readPassages(rows.map((row) => row.footballer.id))

  for (const { footballer, nationality } of rows) {
    careers.set(footballer.id, {
      footballerId: footballer.id,
      name: footballer.name,
      wikiFrUrl: footballer.wikiFrUrl,
      wikiEnUrl: footballer.wikiEnUrl,
      nationality:
        nationality === null
          ? null
          : {
              id: nationality.id,
              code: nationality.code,
              frName: nationality.frName,
              flagKey: nationality.flagKey,
            },
      playerClubs: sortPlayerClubs(passages.get(footballer.id) ?? []),
    })
  }

  return careers
}

/** The passages of several footballers, grouped by footballer, unordered. */
async function readPassages(
  footballerIds: readonly string[],
): Promise<Map<string, PlayerClub[]>> {
  const rows = await db
    .select({
      footballerId: playerClubs.footballerId,
      id: playerClubs.id,
      clubId: playerClubs.clubId,
      clubName: clubs.frName,
      // The crest travels with the club's name: the hints of tiers 2, 4 and 5
      // are one line per passage, and they are read from here.
      crestKey: clubs.crestKey,
      isLoan: playerClubs.isLoan,
      startYear: playerClubs.startYear,
      endYear: playerClubs.endYear,
      matches: playerClubs.matches,
      goals: playerClubs.goals,
    })
    .from(playerClubs)
    .innerJoin(clubs, eq(clubs.id, playerClubs.clubId))
    .where(inArray(playerClubs.footballerId, [...footballerIds]))

  const grouped = new Map<string, PlayerClub[]>()
  for (const { footballerId, ...passage } of rows) {
    const known = grouped.get(footballerId)
    if (known === undefined) grouped.set(footballerId, [passage])
    else known.push(passage)
  }

  return grouped
}
