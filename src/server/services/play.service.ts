import 'server-only'

import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { challengeItems, dailyChallenges, playerProgress } from '@/server/db/schema'
import { todayInParis } from '@/server/domain/challenge-calendar'
import { needsCareer, readPlay, readPlayStatus } from '@/server/domain/play'
import { isExhausted } from '@/server/domain/reveal-ladder'
import { getFootballerCareer, getFootballerCareers } from '@/server/services/catalogue.service'
import { DOUBLE_SUBMIT_MS, MAX_TRIES, isGridOfDay } from '@/shared/play'
import { asPosition } from '@/shared/schedule'
import type { ChallengeDate, Position } from '@/shared/schedule'
import type { DayPlays, EnigmaPlay, PlayMode, PlayStatus } from '@/shared/play'

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
 * ## Nothing leaves before it is paid for
 *
 * A partie carries the essais spent, the hints those erreurs earned, and — only
 * once it is over — the name of the footballer (specs §10.1). What decides each
 * of those three is `server/domain/play.ts`, in one function, so there is no
 * second path here that could answer differently.
 *
 * The catalogue is read **only when the partie has something to show**
 * (`needsCareer`). That is not an optimisation with a nice side effect, it is
 * the side effect that matters: the request that opens an enigma — nearly every
 * request there is at the minute of the peak — never loads a footballer's name
 * at all, so there is nothing there to serialise by mistake.
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
      footballerId: challengeItems.footballerId,
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

  const parties = rows.flatMap((row) => {
    // `position` is an `integer` column, so a hand-written 4 is narrowed here
    // rather than cast — the same reading both the calendar and the grid apply.
    const position = asPosition(row.position)
    return position === null ? [] : [{ ...row, position }]
  })

  // The catalogue only for the parties that have earned something. An enigma
  // just opened has neither a hint nor an answer, so its footballer is never
  // read — see `needsCareer`.
  const careers = await getFootballerCareers(
    parties.filter((row) => needsCareer(row, args.date, args.today)).map((r) => r.footballerId),
  )

  return parties.map((row) =>
    readPlay({
      play: row,
      gridDate: args.date,
      career: careers.get(row.footballerId),
      today: args.today,
    }),
  )
}

/**
 * Why an essai was not played at all.
 *
 * None of the three is a move in the game, and that is the point: the specs
 * leave **three forms of answer and not four** — trouvé, faux, la sixième
 * erreur — because the input is a selection in a list, so « pas un footballeur »
 * cannot happen (specs §10). A doublon and a tour passé are ordinary erreurs
 * and take the ordinary path.
 *
 * - `no-enigma` — the grid has no such position. Reachable by hand, and by an
 *   admin reprogramming the day under a page already open.
 * - `not-open` — no partie. An essai before the enigma was opened is a client
 *   bug: the fold is what creates the partie (`docs/modele-donnees.md` §4).
 * - `over` — the partie is finished. **This is where the seventh essai is
 *   refused**, and it is the same refusal as playing on yesterday's grid, for
 *   the same reason: both are read as finished by `readPlayStatus`.
 */
export type TryRefusal = 'no-enigma' | 'not-open' | 'over'

/** A refused essai. Nothing was written and nothing was spent. */
export class TryRefusedError extends Error {
  constructor(readonly reason: TryRefusal) {
    super(`Essai refusé : ${reason}.`)
    this.name = 'TryRefusedError'
  }
}

/** One essai: a footballer proposed, or a tour passé. */
export type TryCommand = {
  playerId: string
  /** The grid, as the client read it off the page it is holding. */
  date: ChallengeDate
  position: Position
  /** The footballer proposed — **null is « passer »**, which costs the same. */
  footballerId: string | null
}

/**
 * L'essai: the one move of the game.
 *
 * ## Everything costs an essai, and the answer is the only way out
 *
 * A wrong footballer, a footballer already proposed, a tour passé: one essai
 * each, one hint each (specs §3, §10). They are not distinguished here and they
 * are not distinguished in the row either — there is no `skips_used` column,
 * and the doublon is not looked up against a list of what was already tried,
 * because the *rule* is that it costs, so there is nothing to look up.
 *
 * ## What comes back is a partie, not a verdict
 *
 * The answer is an `EnigmaPlay` — the same value the state route serves — and
 * the three forms the specs ask for are its three statuses: `in_progress` is a
 * faux, `solved` is trouvé, `failed` is the sixth erreur. One shape rather than
 * two, so there is one place where a hint or a name could leak early and it is
 * already tested. The hints it carries are the tiers the erreurs have paid for
 * and never one more, which is `reveal-ladder.ts` and nothing here.
 *
 * ## The double-clic is not the doublon
 *
 * They are opposites and they look alike (`docs/stack-technique.md` §4).
 * Proposing a footballer already tried **costs** an essai: that is a game rule.
 * The *same* proposition arriving twice within `DOUBLE_SUBMIT_MS` costs
 * **nothing**: that is one click the browser sent twice, and it became a real
 * risk the day the doublon started costing. It is answered by returning the
 * partie unchanged, which is the same answer the first of the two requests gave
 * — the client cannot tell, and has nothing to reconcile.
 *
 * A tour passé is stored as a proposition of nobody (`null`), so double-clicking
 * « passer » is caught by the same window. The column is nullable and this is
 * what it is nullable for.
 *
 * ## A concurrent essai spends its own, and never somebody else's
 *
 * The update is a compare-and-set on `(tries_used, status)`, and the loser
 * **goes round again** rather than reporting the winner's move as its own.
 * Both halves matter and they are different rules:
 *
 * - without the compare-and-set, two essais reading the same partie would both
 *   write `n + 1` and two moves would cost one essai;
 * - without the retry, the loser would write nothing and cost nothing, and a
 *   second tab proposing a *different* footballer would be silently swallowed —
 *   against « tout consomme un essai » (specs §10). The re-read is what makes
 *   it a real essai on the partie as it now stands.
 *
 * Going round again is also what re-applies the two-second window: if the
 * winner wrote the same proposition, the second pass recognises it as a
 * double-clic and costs nothing, which is the right answer for that case and
 * not a special case anywhere.
 */
export async function submitTry(command: TryCommand): Promise<EnigmaPlay> {
  const today = todayInParis()

  // Bounded, and the bound *is* the game: every pass that loses lost to a write
  // on the same row, and a partie only has six essais to be written on before
  // it refuses everything. A seventh pass would have nothing left to spend.
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const spent = await attemptTry(command, today)
    if (spent !== null) return await asPlay(spent, command, today)
  }

  // Six consecutive losses on one row. Nothing was written by this request and
  // the partie is whatever the writers left it: saying so beats a seventh pass.
  return await asPlay(await readPartie(command), command, today)
}

/**
 * One pass at the essai: read the partie, refuse what has to be refused, and
 * either spend an essai or lose the row to somebody who got there first.
 *
 * Null means *lost the row*, never *refused* — a refusal is an exception, and
 * the difference is what the caller loops on.
 */
async function attemptTry(command: TryCommand, today: ChallengeDate): Promise<Partie | null> {
  const partie = await readPartie(command)

  const { progressId } = partie
  if (progressId === null) throw new TryRefusedError('not-open')

  const status = readPlayStatus({ ...partie, gridDate: command.date }, today)
  if (status !== 'in_progress' || isExhausted(partie.triesUsed)) {
    throw new TryRefusedError('over')
  }

  if (repeatedSubmission(partie, command)) return partie

  return await spendTry({ ...partie, progressId }, command)
}

/**
 * The partie as the joueur reads it, catalogue and all.
 *
 * The career is read every time and not only when something was spent: a partie
 * that reaches here has an essai on it, so it has a hint or an answer to show.
 * The cheap path — an enigma just opened — is the one that never gets here.
 */
async function asPlay(
  partie: Partie,
  command: TryCommand,
  today: ChallengeDate,
): Promise<EnigmaPlay> {
  const career = await getFootballerCareer(partie.footballerId)

  return readPlay({
    play: { ...partie, position: command.position },
    gridDate: command.date,
    // The catalogue's `null` for "no such footballer" and the reader's
    // `undefined` for "none was read" are the same absence to `readPlay`.
    career: career ?? undefined,
    today,
  })
}

/** The partie as the essai needs it, and the answer it is measured against. */
type Partie = {
  /** Null when the enigma exists but was never opened. */
  progressId: string | null
  footballerId: string
  triesUsed: number
  status: PlayStatus
  mode: PlayMode
  lastGuessFootballerId: string | null
  lastGuessAt: Date | null
}

/**
 * The enigma at this position, and this joueur's partie on it if he has one.
 *
 * A left join rather than two reads, because the two absences are different
 * refusals and one query tells them apart: no row at all is a grid with no such
 * position, a row with no partie is an essai that arrived before the enigma was
 * opened.
 *
 * This is the one query in this file that selects `challenge_items.footballer_id`
 * — it has to, it is what an essai is compared against. It is also why the
 * comparison happens here and the identifier goes no further: what leaves this
 * function is a boolean's worth of it.
 */
async function readPartie(command: TryCommand): Promise<Partie> {
  const rows = await db
    .select({
      progressId: playerProgress.id,
      footballerId: challengeItems.footballerId,
      triesUsed: playerProgress.triesUsed,
      status: playerProgress.status,
      mode: playerProgress.mode,
      lastGuessFootballerId: playerProgress.lastGuessFootballerId,
      lastGuessAt: playerProgress.lastGuessAt,
    })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .leftJoin(
      playerProgress,
      and(
        eq(playerProgress.challengeItemId, challengeItems.id),
        eq(playerProgress.playerId, command.playerId),
      ),
    )
    .where(
      and(
        eq(dailyChallenges.date, command.date),
        eq(challengeItems.position, command.position),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (row === undefined) throw new TryRefusedError('no-enigma')

  return {
    progressId: row.progressId,
    footballerId: row.footballerId,
    triesUsed: row.triesUsed ?? 0,
    status: row.status ?? 'in_progress',
    mode: row.mode ?? 'daily',
    lastGuessFootballerId: row.lastGuessFootballerId,
    lastGuessAt: row.lastGuessAt,
  }
}

/**
 * The same proposition, again, within two seconds — **a double-clic, not a
 * doublon**.
 *
 * `null === null` is what catches a double-clic on « passer »: a tour passé is
 * recorded as a proposition of nobody, so the window covers it without a second
 * mechanism. A *different* footballer inside the window is a real second essai
 * and costs one, which is the whole difference between this and a rate limit.
 */
function repeatedSubmission(partie: Partie, command: TryCommand): boolean {
  if (partie.lastGuessAt === null) return false
  if (partie.lastGuessFootballerId !== command.footballerId) return false

  return Date.now() - partie.lastGuessAt.getTime() < DOUBLE_SUBMIT_MS
}

/**
 * Spends one essai, and closes the partie if this one was the last.
 *
 * The `where` is the compare-and-set: the row must still be at the count and
 * the status this request read. A concurrent essai that got there first fails
 * this update and **nothing is written** — which is reported as `null`, so the
 * caller can go round again and spend an essai on the partie as it now stands.
 *
 * `finished_at` is written here and only here. Nothing writes it at midnight:
 * a partie the day took away is read as a failure and its row is never touched
 * (`docs/modele-donnees.md` §4).
 */
async function spendTry(
  partie: Partie & { progressId: string },
  command: TryCommand,
): Promise<Partie | null> {
  const correct =
    command.footballerId !== null && command.footballerId === partie.footballerId
  const triesUsed = partie.triesUsed + 1
  const status = outcome(correct, triesUsed)
  const now = new Date()

  const updated = await db
    .update(playerProgress)
    .set({
      triesUsed,
      status,
      finishedAt: status === 'in_progress' ? null : now,
      lastGuessFootballerId: command.footballerId,
      lastGuessAt: now,
    })
    .where(
      and(
        eq(playerProgress.id, partie.progressId),
        eq(playerProgress.triesUsed, partie.triesUsed),
        eq(playerProgress.status, 'in_progress'),
      ),
    )
    .returning({ triesUsed: playerProgress.triesUsed, status: playerProgress.status })

  const written = updated[0]

  // Lost the row when nothing came back: somebody wrote between this request's
  // read and its update.
  return written === undefined ? null : { ...partie, ...written }
}

/**
 * What an essai leaves the partie in — the three forms of answer, as a status.
 *
 * `solved` is trouvé, `failed` is the sixth erreur, `in_progress` is a faux
 * with a hint to come. There is no fourth: the input is a selection in a list,
 * so « pas un footballeur » does not exist (specs §10).
 */
function outcome(correct: boolean, triesUsed: number): PlayStatus {
  if (correct) return 'solved'
  return isExhausted(triesUsed) ? 'failed' : 'in_progress'
}
