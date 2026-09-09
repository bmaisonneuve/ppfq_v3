import Link from 'next/link'

import {
  POSITION_LABELS,
  POSITIONS,
  WEEKDAY_LABELS,
  formatChallengeMonth,
  weekdayIndex,
} from '@/shared/schedule'
import type { CalendarDay, MonthCalendar } from '@/shared/schedule'

/**
 * The month view: three positions per date, and the holes.
 *
 * A hole is the absence of a `daily_challenges` row and nothing else — there is
 * no status meaning "nothing planned" — so a square with no grid is drawn as
 * one. It is the whole point of the screen: the same absence is what the weekly
 * alert (#14) and the health route (#15) will read, and seeing it a month at a
 * time is what stops a morning without a grid from arriving unannounced.
 *
 * Clicking a day aims the form at it. It is a link and not a click handler, so
 * the state of the screen is in the URL: a day can be shared, reloaded and
 * navigated back to.
 */
export function MonthCalendarView({
  calendar,
  today,
  selectedDate,
  previousMonth,
  nextMonth,
}: {
  calendar: MonthCalendar
  today: string
  selectedDate: string
  previousMonth: string
  nextMonth: string
}) {
  const first = calendar.days[0]
  // The empty squares before the 1st, so the columns line up with the weekdays.
  const lead = first === undefined ? 0 : weekdayIndex(first.date)
  const gaps = calendar.days.filter((day) => day.grid === null).length

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">
          {formatChallengeMonth(calendar.month)}{' '}
          <span className="text-sm font-normal text-neutral-500">
            {gaps === 0
              ? 'aucun trou'
              : `${gaps} jour${gaps > 1 ? 's' : ''} sans grille`}
          </span>
        </h2>
        <nav className="flex gap-3 text-sm">
          <Link
            href={scheduleHref(previousMonth, selectedDate)}
            className="underline underline-offset-2"
          >
            ← {formatChallengeMonth(previousMonth)}
          </Link>
          <Link
            href={scheduleHref(nextMonth, selectedDate)}
            className="underline underline-offset-2"
          >
            {formatChallengeMonth(nextMonth)} →
          </Link>
        </nav>
      </header>

      <ol className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <li key={label} className="px-1 text-xs font-medium text-neutral-500">
            {label}
          </li>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <li key={`lead-${index}`} aria-hidden />
        ))}
        {calendar.days.map((day) => (
          <li key={day.date}>
            <DaySquare
              day={day}
              month={calendar.month}
              isToday={day.date === today}
              isSelected={day.date === selectedDate}
            />
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * One square. A programmed day lists its three positions; a hole says so, in
 * the words the admin will use when he goes looking for what is missing.
 */
function DaySquare({
  day,
  month,
  isToday,
  isSelected,
}: {
  day: CalendarDay
  month: string
  isToday: boolean
  isSelected: boolean
}) {
  const grid = day.grid
  const border = isSelected
    ? 'border-neutral-900'
    : grid === null
      ? 'border-dashed border-amber-400'
      : 'border-neutral-200'

  return (
    <Link
      href={scheduleHref(month, day.date)}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex h-28 flex-col gap-0.5 overflow-hidden rounded-md border bg-white p-1.5 ${border}`}
    >
      <span className="flex items-baseline justify-between text-xs">
        <span className={isToday ? 'font-semibold' : 'text-neutral-500'}>
          {Number(day.date.slice(8, 10))}
        </span>
        {grid === null ? null : (
          <span className="truncate text-neutral-500">{grid.theme}</span>
        )}
      </span>

      {grid === null ? (
        <span className="text-xs text-amber-700">aucune grille</span>
      ) : (
        <ol className="flex flex-col gap-0.5 text-[11px] leading-tight">
          {POSITIONS.map((position) => {
            const enigma = grid.enigmas.find((e) => e.position === position)
            return (
              <li
                key={position}
                className={enigma === undefined ? 'text-amber-700' : 'truncate'}
                title={`${POSITION_LABELS[position]} — ${enigma?.name ?? 'vide'}`}
              >
                {position}. {enigma?.name ?? 'vide'}
              </li>
            )
          })}
        </ol>
      )}
    </Link>
  )
}

/**
 * The screen's whole state, in the URL: which month is shown, and which day the
 * form is aimed at. Paging months keeps the day; picking a day keeps the month.
 */
const scheduleHref = (month: string, date: string) =>
  `/admin/schedule?month=${month}&date=${date}`
