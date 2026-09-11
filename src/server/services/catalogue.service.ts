import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { clubs, footballers, nationalities, playerClubs } from '@/server/db/schema'
import { sortPlayerClubs } from '@/server/domain/career'
import type { FootballerCareer } from '@/shared/career'

/**
 * Reads a footballer's career from the catalogue.
 *
 * Services are the only way in: routing, Server Actions and worker tasks call
 * this, and none of them touches `db/` or `domain/` itself.
 *
 * The rows come back unordered and `sortPlayerClubs` puts them in order. The
 * ordering rule lives in the domain rather than in an `ORDER BY` so that every
 * screen reading a career gets the same sequence from one definition; a career
 * is a dozen rows, so the sort costs nothing.
 *
 * This returns catalogue data, not what a player may see. Deciding which parts
 * reach the client, and when, is the reveal ladder's job.
 */
export async function getFootballerCareer(
  footballerId: string,
): Promise<FootballerCareer | null> {
  const [row] = await db
    .select({ footballer: footballers, nationality: nationalities })
    .from(footballers)
    .leftJoin(nationalities, eq(nationalities.id, footballers.nationalityId))
    .where(eq(footballers.id, footballerId))
    .limit(1)

  if (!row) return null

  const rows = await db
    .select({
      id: playerClubs.id,
      clubId: playerClubs.clubId,
      clubName: clubs.frName,
      isLoan: playerClubs.isLoan,
      startYear: playerClubs.startYear,
      endYear: playerClubs.endYear,
      matches: playerClubs.matches,
      goals: playerClubs.goals,
    })
    .from(playerClubs)
    .innerJoin(clubs, eq(clubs.id, playerClubs.clubId))
    .where(eq(playerClubs.footballerId, footballerId))

  const { footballer, nationality } = row

  return {
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
    playerClubs: sortPlayerClubs(rows),
  }
}
