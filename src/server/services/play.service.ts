import 'server-only'

import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { challengeItems, dailyChallenges, playerProgress } from '@/server/db/schema'
import { todayInParis } from '@/server/domain/challenge-calendar'
import { readPlayStatus } from '@/server/domain/play'
import { isGridOfDay } from '@/shared/play'
import { asPosition } from '@/shared/schedule'
import type { ChallengeDate, Position } from '@/shared/schedule'
import type { DayPlays, EnigmaPlay } from '@/shared/play'

/**
 * La partie: one joueur's state on the enigmas of one grid.
 *
 * ## A partie is born when an enigma is opened
 *
 * Not at the first essai (`docs/modele-donnees.md` §4). The difference is the
 * denominator of every difficulty measure the calibration screen will read
 * (#12): parties per enigma is then the number of people who *saw* it, and the
 * ones who looked and walked away are the most interesting part of that number.
 *
 * The consequence is an interface rule and it is not optional: the three
 * enigmas must not unfold at once, or one arrival makes three parties. That is
 * why `ui/game` folds two of the three, and it is the reason `open` below names
 * a single position.
 *
 * ## Nothing here reveals anything
 *
 * A partie says how many essais have been spent and how it ended. No footballer
 * identifier, no name, no hint — the answer never leaves the server before the
 * end of a partie (specs §10.1), and the essai and the reveal ladder that go
 * with it are #9's. The query does not select `challenge_items.footballer_id`
 * at all: a column nobody reads cannot be serialised by mistake, the same rule
 * `grid.service.ts` follows for the cached page.
 *
 * ## Where the identity is
 *
 * Not here. This service takes a `playerId`, and turning a cookie into one is
 * `player.service.ts` — so everything below is a real row in a real database in
 * `test/services/play.service.test.ts`, with no request to fake.
 */

/** What the personal-state door asks for. */
export type DayPlaysQuery = {
  playerId: string
  /** The grid, as the client read it off the page it is holding. */
  date: ChallengeDate
  /** The enigma being opened, if one is. Reading is not opening. */
  open?: Position
}

/**
 * The joueur's state on one grid — and the partie created, if he is opening an
 * enigma of the grid of the day.
 *
 * One call, because the client has one question: it holds a prerendered page,
 * it hydrates, and it needs to know what it already owns. Splitting the read
 * from the open would mean two round trips at the minute of the peak for an
 * answer that is the same shape either way.
 *
 * **Opening is refused on any date but today's**, and that is not a validation:
 * the page is prerendered and served from a shared cache for up to a minute
 * (ADR-0008), so a joueur arriving at midnight can be holding a grid that has
 * just turned. Creating a partie for it would create one that the reading rule
 * fails on the spot, and would count somebody as exposed to yesterday's enigma.
 * The answer carries `today` for the same reason: the client cannot know.
 */
export async function getDayPlays({ playerId, date, open }: DayPlaysQuery): Promise<DayPlays> {
  const today = todayInParis()

  if (open !== undefined && isGridOfDay(date, today)) {
    await openPlay({ playerId, date, position: open })
  }

  return { date, today, plays: await readPlays({ playerId, date, today }) }
}

/**
 * Opens an enigma: writes the partie, or does nothing at all.
 *
 * Two statements and no transaction. The `on conflict do nothing` is the whole
 * guard against a second partie — a reload, a second tab, a double request —
 * and it is the unique index `(challenge_item_id, player_id)` doing the work
 * rather than a read-then-write, which is exactly what a race slips between.
 *
 * An enigma that is not there is not an error. The client sends a position it
 * read off the grid, so the only ways to get here are a grid that has since
 * been reprogrammed and a hand-written request; answering the state of the day
 * is the right response to both, and it is what the caller does next anyway.
 */
async function openPlay(args: {
  playerId: string
  date: ChallengeDate
  position: Position
}): Promise<void> {
  const found = await db
    .select({ id: challengeItems.id })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(and(eq(dailyChallenges.date, args.date), eq(challengeItems.position, args.position)))

  const enigma = found[0]
  if (enigma === undefined) return

  await db
    .insert(playerProgress)
    // `daily`, and stated rather than defaulted: the column has no default so
    // that the archive (#14) cannot forget to say which mode it is playing in.
    .values({ challengeItemId: enigma.id, playerId: args.playerId, mode: 'daily' })
    .onConflictDoNothing()
}

/**
 * The parties this joueur has on this grid, in position order.
 *
 * Only the enigmas he has opened come back. An enigma he has never unfolded is
 * **absent** rather than present with zero essais, and the distinction is the
 * measure itself: a row exists for somebody who was exposed to the enigma.
 *
 * The status is read through the domain rule and never taken from the column:
 * a partie left open on a grid that is no longer the day's is a failure, by a
 * reading and not by a job at midnight (`docs/modele-donnees.md` §4). Which is
 * why the stored value goes on saying `in_progress` afterwards — there is
 * nothing to write, and nothing to run at the exact minute of the peak.
 */
async function readPlays(args: {
  playerId: string
  date: ChallengeDate
  today: ChallengeDate
}): Promise<EnigmaPlay[]> {
  const rows = await db
    .select({
      position: challengeItems.position,
      triesUsed: playerProgress.triesUsed,
      status: playerProgress.status,
      mode: playerProgress.mode,
    })
    .from(playerProgress)
    .innerJoin(challengeItems, eq(challengeItems.id, playerProgress.challengeItemId))
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(
      and(eq(playerProgress.playerId, args.playerId), eq(dailyChallenges.date, args.date)),
    )
    .orderBy(asc(challengeItems.position))

  return rows.flatMap((row) => {
    // `position` is an `integer` column, so a hand-written 4 is narrowed here
    // rather than cast — the same reading both the calendar and the grid apply.
    const position = asPosition(row.position)
    if (position === null) return []

    return [
      {
        position,
        triesUsed: row.triesUsed,
        status: readPlayStatus({ ...row, gridDate: args.date }, args.today),
      },
    ]
  })
}
