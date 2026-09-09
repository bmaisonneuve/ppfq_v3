/**
 * Programmer une journée: the scheduling screen's isomorphic layer.
 *
 * Scheduling is choosing a date, a theme and three footballers — nothing else
 * (ADR-0001). An enigma **designates** a footballer and copies nothing from
 * him, so there is no snapshot here, no pre-computed hint, and no career: what
 * travels between the server and the calendar is three identifiers and the
 * names to print beside them.
 *
 * The one thing that is *not* a designation is the refusal. A hint tier that
 * falls empty breaks the game after four tries already spent, so the checks are
 * blocking, and they have to say precisely what is missing, footballer by
 * footballer — which is why the obstacle is a value with a code and a club
 * rather than a boolean.
 */
import { z } from 'zod'

import { IDLE_ADMIN_ACTION } from './admin'
import type { AdminAction, AdminActionState } from './admin'

/**
 * The rank of an enigma in its grid. Difficulty rises with it, and the order is
 * decided by hand: nothing derives it from notoriety or from a success rate.
 */
export type Position = 1 | 2 | 3

export const POSITIONS: readonly Position[] = [1, 2, 3]

/** What each position is called, in the words of `CONTEXT.md`. */
export const POSITION_LABELS: Record<Position, string> = {
  1: 'échauffement',
  2: 'titulaire',
  3: 'légende',
}

/**
 * A grid's date, as `YYYY-MM-DD`.
 *
 * A *date*, never a timestamp: the grid of the day is a `SELECT WHERE date =
 * <today in Paris>`, so the column has no time and no zone to disagree about
 * (docs/stack-technique.md §4). Kept as a string all the way down for the same
 * reason — a `Date` would drag a UTC midnight through every layer and turn the
 * 1st into the 31st for anyone east of Greenwich.
 */
export type ChallengeDate = string

/** A month, as `YYYY-MM`. What the calendar navigates by. */
export type ChallengeMonth = string

export const CHALLENGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const CHALLENGE_MONTH_PATTERN = /^\d{4}-\d{2}$/

/**
 * A grid date or month as the admin reads it: "mercredi 9 septembre 2026",
 * "septembre 2026".
 *
 * Both go through midday UTC, and that is the whole reason this is one function
 * and not two expressions in two components: parsing `2026-09-09` gives
 * midnight UTC, which is the 8th anywhere west of Greenwich, and formatting it
 * in the viewer's zone would print the wrong day. Noon has no such neighbour,
 * and `timeZone: 'UTC'` keeps the formatter from moving it back.
 */
export function formatChallengeDate(date: ChallengeDate): string {
  return frenchCalendar(`${date}T12:00:00Z`, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** The month, spelled the way a French calendar heads it. */
export function formatChallengeMonth(month: ChallengeMonth): string {
  return frenchCalendar(`${month}-01T12:00:00Z`, { month: 'long', year: 'numeric' })
}

function frenchCalendar(instant: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(instant).toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })
}

/**
 * Which column a date belongs in, Monday first — 0 for Monday, 6 for Sunday.
 *
 * A month view has to leave the squares before its first day empty, and getting
 * that wrong shifts every date in the grid by a column. Computed in UTC so the
 * machine's zone cannot move a Monday into a Sunday, and here rather than in
 * the component so it is a rule with a test rather than an expression inside a
 * `map`.
 */
export function weekdayIndex(date: ChallengeDate): number {
  const sundayFirst = new Date(`${date}T00:00:00Z`).getUTCDay()
  return (sundayFirst + 6) % 7
}

/** Monday first, as a French calendar is read. */
export const WEEKDAY_LABELS: readonly string[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

/**
 * The default theme, and the only one the code ever writes on its own.
 *
 * Free text rather than an enum, and **no automatic check attaches to it**
 * (specs §4): any theme may be posted any day, a Friday may be perfectly
 * standard, and nothing verifies that the three footballers match what the
 * theme announces. The admin answers for that.
 */
export const DEFAULT_THEME = 'standard'

/** A typo guard, not a rule: a theme is a label, not a sentence. */
export const MAX_THEME_LENGTH = 60

/**
 * The earliest start year a scheduled passage may carry.
 *
 * One of the three implausibility predicates of `docs/modele-donnees.md` §4,
 * measured as frequent in the source: 131 passages start before 1880, which is
 * before organised football. It is a *scheduling* predicate and deliberately
 * not an import or edit rule — the referential stays exhaustive and such a
 * footballer stays a valid suggestion, he simply cannot be scheduled.
 */
export const EARLIEST_PLAUSIBLE_START_YEAR = 1880

/**
 * Why a footballer cannot be scheduled.
 *
 * The first two are about **completeness**: a hint tier reads a column, and an
 * empty column is a blank screen at try four or five. The last three are the
 * implausibility predicates the model counts in the source — they do not make
 * an enigma incomplete, they make it wrong.
 *
 * - `no-career` — no passage at all. There is no enigma to show.
 * - `missing-figures` — a passage without its league matches or league goals,
 *   so hint 4 or hint 5 would be empty.
 * - `missing-nationality` — hint 3 would be empty.
 * - `goals-above-matches` — 2 989 passages of the source violate it.
 * - `end-before-start` — 181 cases.
 * - `start-before-1880` — 131 cases.
 *
 * None of this tests whether the parcours is **true**. A career can be complete
 * and false by omission — at least 21,5 % of otherwise complete ones have a
 * hole of two years or more — and no query detects it. The only guard is the
 * admin's eye on the curation screen.
 */
export type ScheduleObstacleCode =
  | 'no-career'
  | 'missing-figures'
  | 'missing-nationality'
  | 'goals-above-matches'
  | 'end-before-start'
  | 'start-before-1880'

/**
 * One reason, and the club it is about when there is one.
 *
 * The club is the whole difference between a refusal the admin can act on and
 * one he has to go hunting for: "matchs ou buts manquants" on a career of eight
 * clubs says nothing, "matchs ou buts manquants (AS Cannes)" says where to go.
 */
export type ScheduleObstacle = {
  code: ScheduleObstacleCode
  /** Null when the obstacle is about the footballer rather than one passage. */
  clubName: string | null
}

/** One footballer, and everything standing between him and a grid. */
export type FootballerSchedulability = {
  footballerId: string
  name: string
  /** Empty means schedulable. */
  obstacles: ScheduleObstacle[]
}

const OBSTACLE_WORDS: Record<ScheduleObstacleCode, string> = {
  'no-career': 'aucun passage saisi',
  'missing-figures': 'matchs ou buts manquants',
  'missing-nationality': 'nationalité manquante',
  'goals-above-matches': 'plus de buts que de matchs',
  'end-before-start': 'fin de passage avant son début',
  'start-before-1880': `début avant ${EARLIEST_PLAUSIBLE_START_YEAR}`,
}

/** One obstacle in the admin's words, with the club when it has one. */
function describeObstacle(obstacle: ScheduleObstacle): string {
  const words = OBSTACLE_WORDS[obstacle.code]
  return obstacle.clubName === null ? words : `${words} (${obstacle.clubName})`
}

/**
 * One footballer's refusal, as one line: his name, then every reason.
 *
 * Named rather than numbered by position, because the admin fixes this on the
 * curation screen where positions do not exist.
 */
function describeSchedulability(footballer: FootballerSchedulability): string {
  return `${footballer.name} : ${footballer.obstacles.map(describeObstacle).join(' ; ')}`
}

/**
 * The whole refusal message: every footballer that has something wrong, one
 * line each. Returns null when nothing is wrong.
 */
export function describeRefusal(
  footballers: readonly FootballerSchedulability[],
): string | null {
  const blocked = footballers.filter((f) => f.obstacles.length > 0)
  if (blocked.length === 0) return null

  return `Programmation refusée. ${blocked.map(describeSchedulability).join(' — ')}.`
}

/**
 * What the scheduling form may send.
 *
 * Three footballers, and three *different* ones: a grid asking the same
 * question twice is not a grid. The theme is validated as a label and nothing
 * more — no vocabulary, no day of the week, no coherence with the three
 * careers, all of which the specs put under the admin's responsibility.
 */
export const ScheduleInput = z
  .object({
    date: z.string().regex(CHALLENGE_DATE_PATTERN, { error: 'Date invalide.' }),
    theme: z
      .string()
      .trim()
      .min(1, { error: 'Le thème ne peut pas être vide.' })
      .max(MAX_THEME_LENGTH, { error: `Thème trop long (plus de ${MAX_THEME_LENGTH}).` }),
    /** In position order: index 0 is the échauffement, index 2 the légende. */
    footballerIds: z
      .array(z.uuid({ error: 'Choisissez un footballeur pour chaque position.' }))
      .length(POSITIONS.length, {
        error: 'Une grille a exactement trois énigmes.',
      }),
  })
  .refine(({ footballerIds }) => new Set(footballerIds).size === footballerIds.length, {
    error: 'Le même footballeur ne peut pas occuper deux positions.',
    path: ['footballerIds'],
  })

export type ScheduleInput = z.infer<typeof ScheduleInput>

/** One enigma of a scheduled grid, as the calendar prints it. */
export type ScheduledEnigma = {
  position: Position
  footballerId: string
  /** Read from the catalogue on every render — nothing is copied at scheduling. */
  name: string
}

/** A programmed day: its theme, and its three enigmas in position order. */
export type ScheduledGrid = {
  date: ChallengeDate
  theme: string
  enigmas: ScheduledEnigma[]
}

/**
 * One square of the month view.
 *
 * `grid === null` **is** the hole. There is no "gap" row and no status to
 * maintain: the absence of a `daily_challenges` line is the absence of a grid
 * (`docs/modele-donnees.md` §4), which is also what the weekly job and the
 * health route will read.
 */
export type CalendarDay = {
  date: ChallengeDate
  grid: ScheduledGrid | null
}

/** A month of the programming calendar, every day of it, holes included. */
export type MonthCalendar = {
  month: ChallengeMonth
  days: CalendarDay[]
}

/**
 * Everything the programming screen shows, in one read.
 *
 * The screen asks for a month and a day and gets back the whole page, the way
 * the curation screen gets a `CurationDossier`: routing may only reach the
 * server through a service, so the Paris calendar — which lives in the domain
 * — is resolved on this side of the door rather than in the page.
 */
export type SchedulingScreen = {
  /** Today in Paris, so the view can say which square is today. */
  today: ChallengeDate
  calendar: MonthCalendar
  previousMonth: ChallengeMonth
  nextMonth: ChallengeMonth
  /** The day the form is aimed at. Today, unless the admin picked another. */
  selectedDate: ChallengeDate
  /** What is already programmed there — the form corrects it rather than adding. */
  selectedGrid: ScheduledGrid | null
  /** The themes already used, offered to the free-text field. */
  themes: string[]
}

/**
 * What a scheduling form gets back — the admin's one answer shape, under the
 * name this screen calls it.
 *
 * A refusal has to land as a sentence next to the form the admin was filling
 * in, not as an error boundary over it. Here that matters more than anywhere
 * else, because the refusal *is* the feature.
 */
export type ScheduleActionState = AdminActionState

export const IDLE_SCHEDULE_ACTION: ScheduleActionState = IDLE_ADMIN_ACTION

/** The signature the scheduling form takes as a prop. */
export type ScheduleAction = AdminAction
