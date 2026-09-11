import 'server-only'

import { CHALLENGE_DATE_PATTERN, CHALLENGE_MONTH_PATTERN } from '@/shared/schedule'
import type { ChallengeDate, ChallengeMonth } from '@/shared/schedule'

/**
 * The Europe/Paris calendar — a pure rule, no database, no Next.
 *
 * Everything here is string arithmetic on `YYYY-MM-DD`, and that is the point.
 * A grid date is a `date` column, not a timestamp: the grid of the day is a
 * `SELECT WHERE date = <today in Paris>`, computed lazily and never by a job
 * (docs/stack-technique.md §4). No component is sensitive to the exact hour, so
 * the twice-yearly hour change is a non-subject — as long as nobody counts days
 * in milliseconds, which is exactly what these functions exist to avoid.
 */

/**
 * Today's date in Paris, whatever the server's zone.
 *
 * `en-CA` because its short date format *is* `YYYY-MM-DD`, zero-padded, which
 * is the format the `date` column and every comparison in this codebase use.
 * Reading `getFullYear()` off a `Date` would answer in the machine's zone, and
 * `toISOString()` would answer in UTC — both wrong for the two hours around
 * midnight when Paris has already turned the page.
 */
export function todayInParis(now: Date = new Date()): ChallengeDate {
  return PARIS_DAY.format(now)
}

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The month a date belongs to: the date without its day. */
export function monthOfDate(date: ChallengeDate): ChallengeMonth {
  return date.slice(0, 7)
}

/**
 * Every day of a month, in order — the squares of the month view.
 *
 * The length comes from `Date.UTC` with day 0 of the *next* month, which is the
 * last day of this one. UTC throughout so no zone can shift the boundary; the
 * result is a plain count, and the dates themselves are assembled as text.
 */
export function datesInMonth(month: ChallengeMonth): ChallengeDate[] {
  const [year, monthNumber] = splitMonth(month)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()

  return Array.from({ length: lastDay }, (_, index) => `${month}-${pad(index + 1)}`)
}

/**
 * The day before, as text — what the série counts back on.
 *
 * `Date.UTC` and not a local `Date`: this is a Paris *date*, and subtracting 24
 * hours from a local one would give the same day back twice a year. UTC has no
 * such day, so the arithmetic is exact — which is the whole reason this is a
 * function and not a subtraction written wherever a streak is computed.
 */
export function previousDate(date: ChallengeDate): ChallengeDate {
  const [year, month] = splitMonth(date)
  const day = Number(date.slice(8, 10))
  // Day 0 of a month is the last day of the one before, so 1 January needs no
  // special case: `Date.UTC` normalises it on its own.
  const before = new Date(Date.UTC(year, month - 1, day - 1))

  return `${before.getUTCFullYear()}-${pad(before.getUTCMonth() + 1)}-${pad(before.getUTCDate())}`
}

/** The month `delta` months away, crossing years correctly. */
export function shiftMonth(month: ChallengeMonth, delta: number): ChallengeMonth {
  const [year, monthNumber] = splitMonth(month)
  // `Date.UTC` normalises month 0 into December of the year before, and month
  // 13 into January of the year after, which is the whole arithmetic.
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`
}

/**
 * A month out of a query string, or the fallback.
 *
 * It falls back rather than throwing: the value comes from the URL, where a
 * hand-typed `?month=septembre` is a typo and not an incident, and a 404 on the
 * calendar would be a strange answer to one. `2026-13` is well-formed and
 * impossible — it would render an empty calendar — so it is refused too.
 */
export function parseChallengeMonth(
  value: string | undefined,
  fallback: ChallengeMonth,
): ChallengeMonth {
  if (value === undefined || !CHALLENGE_MONTH_PATTERN.test(value)) return fallback

  const [, monthNumber] = splitMonth(value)
  if (monthNumber < 1 || monthNumber > 12) return fallback

  return value
}

function splitMonth(month: ChallengeMonth): [year: number, month: number] {
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * A date out of a query string, or the fallback — the calendar's day parameter.
 *
 * Well-formed is not enough: `2026-02-30` matches the pattern and is not a day,
 * and a form pre-filled with it would refuse on submit for a reason nobody
 * could see. `Date.UTC` normalises it into 2 March, so comparing the round trip
 * back to the text is what catches it.
 */
export function parseChallengeDate(
  value: string | undefined,
  fallback: ChallengeDate,
): ChallengeDate {
  if (value === undefined || !CHALLENGE_DATE_PATTERN.test(value)) return fallback

  const [year, month] = splitMonth(value)
  const day = Number(value.slice(8, 10))
  const roundTrip = new Date(Date.UTC(year, month - 1, day))

  const real =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day

  return real ? value : fallback
}
