import 'server-only'

import { and, asc, between, eq, notInArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { challengeItems, dailyChallenges, footballers } from '@/server/db/schema'
import {
  datesInMonth,
  monthOfDate,
  nextDate,
  parseChallengeDate,
  parseChallengeMonth,
  previousDate,
  shiftMonth,
  todayInParis,
} from '@/server/domain/challenge-calendar'
import { assessSchedulability } from '@/server/domain/schedule'
import { POSITIONS, asPosition, describeRefusal } from '@/shared/schedule'
import type {
  CalendarDay,
  ChallengeDate,
  ChallengeMonth,
  FootballerSchedulability,
  MonthCalendar,
  Position,
  ScheduleDayScreen,
  ScheduleInput,
  ScheduledEnigma,
  ScheduledGrid,
  SchedulingScreen,
} from '@/shared/schedule'

import { getFootballerCareer } from './catalogue.service'
import { FootballerNotFoundError } from './curation.service'

/**
 * Programmation: choosing a date, a theme and three footballers, as a service.
 *
 * A grid is three **designations** and nothing more (ADR-0001). Nothing is
 * copied here — no parcours, no hint, no duration — so there is no snapshot to
 * invalidate and no second version of a career to reconcile. What this module
 * writes is `daily_challenges` and three `challenge_items`; what it reads back
 * for the calendar is the name of each footballer, straight from the catalogue.
 *
 * ## The refusal is the feature
 *
 * `scheduleGrid` checks before it writes, and refuses. That is not defensive
 * programming: a hint tier reads its column at the moment it is revealed, so a
 * missing nationality is a blank screen at try three with three tries already
 * spent and no way back for the player. The rules are pure and live in
 * `server/domain/schedule.ts`; this module is what puts a real career in front
 * of them and what refuses to write.
 *
 * The refusal names every footballer and every reason at once, because the
 * admin leaves this screen to go and edit: a refusal that reveals one hole at a
 * time costs a round trip per field.
 *
 * ## What is deliberately absent
 *
 * - **No gap table.** The absence of a `daily_challenges` row *is* the hole.
 *   The month view, the weekly alert (#14) and the health route (#15) all read
 *   the same absence, and none of them can drift from a status column.
 * - **No theme vocabulary.** Free text, and no automatic check attaches to it
 *   (specs §4): any theme any day. The screen offers what has been used.
 * - **No guarantee over time.** Nothing stops a later import from emptying a
 *   field of an enigma already published. This is a check at scheduling, and
 *   the model says so.
 *
 * ## Where the admin check is
 *
 * Not here — `requireAdmin()` in every admin page and every admin Server
 * Action, enforced by `test/architecture/admin-guard.test.ts`.
 */

/**
 * What `scheduleGrid` throws instead of writing: the report, footballer by
 * footballer, and a message that already reads as a sentence.
 *
 * It carries `blocked` as well as the message because "footballer by
 * footballer" is a property of the report and not of the sentence: the suite
 * asserts it on the data, and a future screen that wants to draw the obstacles
 * next to their fields will not have to parse prose back.
 */
export class NotSchedulableError extends Error {
  constructor(readonly blocked: FootballerSchedulability[]) {
    super(describeRefusal(blocked) ?? 'Programmation refusée.')
    this.name = 'NotSchedulableError'
  }
}

/**
 * The whole month screen, from the one parameter the URL carries.
 *
 * It exists because `app/` may only reach the server through a service: the
 * Europe/Paris calendar is a domain rule, so resolving "which month, and what
 * is today" happens here rather than in the page. The page then has one call
 * and no arithmetic.
 *
 * The month falls back rather than fails. It comes from a query string, where
 * `?month=septembre` is a typo and not an incident, and a 404 on the calendar
 * would be a strange answer to one.
 *
 * ## Ce qu'il ne lit plus
 *
 * Les thèmes déjà posés. Ils n'appartiennent qu'au formulaire, et le formulaire
 * est sur la page d'un jour (`getScheduleDayScreen`) : les charger ici était
 * une requête par affichage de mois pour une liste que le mois ne montre pas.
 */
export async function getSchedulingScreen(params: {
  month?: string
}): Promise<SchedulingScreen> {
  const today = todayInParis()
  const month = parseChallengeMonth(params.month, monthOfDate(today))

  return {
    today,
    calendar: await getMonthCalendar(month),
    previousMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
  }
}

/**
 * Une journée du calendrier, et de quoi la programmer : sa grille, ses voisines
 * et les thèmes déjà posés.
 *
 * `null` est une **adresse** qui n'en est pas une — `/admin/schedule/demain`,
 * un 30 février, qui passe le motif et n'est pas un jour. La page en fait un
 * 404, ce qui est ce que c'est. Un jour réel n'a pas d'autre refus : un jour
 * sans grille est exactement ce que l'admin vient combler, et un jour de
 * n'importe quelle année se programme — le calendrier n'a pas de bord.
 *
 * Une seule ligne lue, celle de ce jour-là : le mois d'à côté n'est pas
 * rechargé pour afficher un jour, et les deux voisins sont de l'arithmétique de
 * texte (`server/domain/challenge-calendar.ts`) et non une requête.
 */
export async function getScheduleDayScreen(date: string): Promise<ScheduleDayScreen | null> {
  const today = todayInParis()

  // `parseChallengeDate` retombe sur son défaut plutôt que de lever : comparer
  // sa réponse à ce qui a été demandé est ce qui distingue un jour que
  // quelqu'un a nommé d'un jour que personne n'a nommé.
  if (parseChallengeDate(date, today) !== date) return null

  const [grids, themes] = await Promise.all([
    readGrids(eq(dailyChallenges.date, date)),
    listThemes(),
  ])

  return {
    date,
    grid: grids.get(date) ?? null,
    today,
    month: monthOfDate(date),
    previousDate: previousDate(date),
    nextDate: nextDate(date),
    themes,
  }
}

/**
 * A month of the calendar: every day of it, each with its grid or with the hole
 * where one should be.
 *
 * One query for the whole month, joined to the enigmas and to the footballers,
 * then assembled against the days the calendar itself produces — so a day with
 * no row comes back as a day, not as a missing key the view has to guess at.
 */
export async function getMonthCalendar(month: ChallengeMonth): Promise<MonthCalendar> {
  const days = datesInMonth(month)
  const first = days[0]
  const last = days[days.length - 1]
  if (first === undefined || last === undefined) return { month, days: [] }

  const grids = await readGrids(between(dailyChallenges.date, first, last))

  return {
    month,
    days: days.map((date): CalendarDay => ({ date, grid: grids.get(date) ?? null })),
  }
}

/**
 * The themes already posted, once each.
 *
 * The screen offers them and does not impose them: the field stays free text,
 * and this list is a memory aid so "rétro" does not become "retro" the third
 * time it is used. A theme nobody has used yet — including the default — is
 * simply typed.
 */
export async function listThemes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ theme: dailyChallenges.theme })
    .from(dailyChallenges)
    .orderBy(asc(dailyChallenges.theme))

  return rows.map((row) => row.theme)
}

/**
 * Programmes a day, or refuses and writes nothing.
 *
 * The three careers are read first and handed to the pure rules; only if all
 * three pass does anything reach the database. A refusal therefore leaves the
 * date exactly as it was — a hole if it was a hole, and the previous grid
 * untouched if there was one, which matters because the admin corrects an
 * existing day by re-submitting it.
 *
 * The write is one transaction and it **replaces**: one grid per date is the
 * model's unique index, and correcting a day is not a second grid.
 *
 * What it replaces is only what changed, and that is not a micro-optimisation:
 * since #8, a partie hangs off its `challenge_items` row by a cascade. Deleting
 * the three enigmas and writing them back — which is what this did while
 * nothing depended on their identity — would delete every partie of the day,
 * for every joueur, the moment the admin corrected a theme at three in the
 * afternoon. So a position whose footballer has not changed keeps its row.
 *
 * The other half of that decision is deliberate too: a position whose
 * footballer *has* changed is a different question, and the parties carrying
 * essais spent on the previous one go with it.
 */
export async function scheduleGrid(input: ScheduleInput): Promise<ScheduledGrid> {
  const careers = await Promise.all(
    input.footballerIds.map(async (footballerId) => {
      const career = await getFootballerCareer(footballerId)
      // Not an obstacle: an obstacle is something an admin can go and fix on
      // the curation screen. An id pointing at nobody is a row that vanished
      // between the search and the submit.
      if (career === null) throw new FootballerNotFoundError(footballerId)
      return career
    }),
  )

  const assessed = careers.map(assessSchedulability)
  const blocked = assessed.filter((footballer) => footballer.obstacles.length > 0)
  if (blocked.length > 0) throw new NotSchedulableError(blocked)

  await db.transaction(async (tx) => {
    const [grid] = await tx
      .insert(dailyChallenges)
      .values({ date: input.date, theme: input.theme, status: 'scheduled' })
      .onConflictDoUpdate({
        target: dailyChallenges.date,
        set: { theme: input.theme, status: 'scheduled' },
      })
      .returning({ id: dailyChallenges.id })

    const gridId = (grid as { id: string }).id

    const wanted = input.footballerIds.map((footballerId, index) => ({
      dailyChallengeId: gridId,
      position: positionAt(index),
      footballerId,
    }))

    const present = await tx
      .select({
        position: challengeItems.position,
        footballerId: challengeItems.footballerId,
      })
      .from(challengeItems)
      .where(eq(challengeItems.dailyChallengeId, gridId))

    // The positions that are already asking for exactly the footballer they
    // are being asked for. Their rows are the ones the day's parties hang off.
    const kept = present
      .filter((item) =>
        wanted.some(
          (enigma) =>
            enigma.position === item.position && enigma.footballerId === item.footballerId,
        ),
      )
      .map((item) => item.position)

    await tx
      .delete(challengeItems)
      .where(
        and(
          eq(challengeItems.dailyChallengeId, gridId),
          // `notInArray` on an empty list is not valid SQL, and an empty list
          // is the common case: a day being programmed for the first time.
          kept.length === 0 ? undefined : notInArray(challengeItems.position, kept),
        ),
      )

    const written = wanted.filter((enigma) => !kept.includes(enigma.position))
    if (written.length > 0) await tx.insert(challengeItems).values(written)
  })

  return {
    date: input.date,
    theme: input.theme,
    enigmas: careers.map((career, index) => ({
      position: positionAt(index),
      footballerId: career.footballerId,
      name: career.name,
    })),
  }
}

/**
 * The grids matching a condition, keyed by date, enigmas in position order.
 *
 * A left join on the enigmas rather than an inner one: this module only ever
 * writes complete grids, but a `daily_challenges` row with no items is a state
 * the database allows, and dropping it from the calendar would show a hole
 * where there is a half-written grid — the one reading that would send the
 * admin looking in the wrong place.
 */
async function readGrids(where: SQL): Promise<Map<ChallengeDate, ScheduledGrid>> {
  const rows = await db
    .select({
      date: dailyChallenges.date,
      theme: dailyChallenges.theme,
      position: challengeItems.position,
      footballerId: challengeItems.footballerId,
      // Read on every render, never stored on the enigma: renaming a footballer
      // renames him in every grid he appears in (ADR-0001).
      name: footballers.name,
    })
    .from(dailyChallenges)
    .leftJoin(challengeItems, eq(challengeItems.dailyChallengeId, dailyChallenges.id))
    .leftJoin(footballers, eq(footballers.id, challengeItems.footballerId))
    .where(where)
    .orderBy(asc(dailyChallenges.date), asc(challengeItems.position))

  const grids = new Map<ChallengeDate, ScheduledGrid>()

  for (const row of rows) {
    const grid = grids.get(row.date) ?? { date: row.date, theme: row.theme, enigmas: [] }
    grids.set(row.date, grid)

    if (row.footballerId === null || row.name === null) continue

    // Narrowed rather than cast (`asPosition`). The month view already draws a
    // missing position as "vide", which is the honest rendering of one it
    // cannot place.
    const position = asPosition(row.position)
    if (position === null) continue

    grid.enigmas.push({
      position,
      footballerId: row.footballerId,
      name: row.name,
    } satisfies ScheduledEnigma)
  }

  return grids
}

/**
 * The position of the nth footballer of a form. The array is in position order,
 * and `POSITIONS` is the only place that order is written down.
 */
function positionAt(index: number): Position {
  const position = POSITIONS[index]
  if (position === undefined) throw new Error(`No position ${index + 1} in a grid.`)
  return position
}
