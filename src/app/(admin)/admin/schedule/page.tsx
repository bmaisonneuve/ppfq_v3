import { requireAdmin } from '@/server/services/admin-auth.service'
import { getSchedulingScreen } from '@/server/services/schedule.service'
import { formatChallengeDate } from '@/shared/schedule'
import { MonthCalendarView } from '@/ui/admin/month-calendar'
import { ScheduleForm } from '@/ui/admin/schedule-form'

import { scheduleGridAction } from './actions'

/**
 * Le calendrier de programmation : un mois, trois positions par date, et les
 * trous.
 *
 * The screen has one read and no arithmetic of its own: routing may only reach
 * the server through a service, and the Europe/Paris calendar is a domain rule.
 * `getSchedulingScreen` resolves the month, the day and today, on the other
 * side of that door.
 *
 * Its state lives in the URL — `?month=` and `?date=` — so a day can be linked
 * to, reloaded, and navigated back to. The form is keyed on the selected day so
 * that moving to another date starts from that date's grid rather than from the
 * previous one's leftovers.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>
}) {
  await requireAdmin()

  const { month, date } = await searchParams
  const screen = await getSchedulingScreen({ month, date })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calendrier de programmation</h1>
        <p className="text-sm text-neutral-600">
          Une grille par date : trois footballeurs et un thème. Les jours sans grille sont
          signalés — c’est leur absence en base qui les signale, rien d’autre.
        </p>
      </div>

      <MonthCalendarView
        calendar={screen.calendar}
        today={screen.today}
        selectedDate={screen.selectedDate}
        previousMonth={screen.previousMonth}
        nextMonth={screen.nextMonth}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {screen.selectedGrid === null ? 'Programmer le' : 'Modifier la grille du'}{' '}
          {formatChallengeDate(screen.selectedDate)}
        </h2>
        <ScheduleForm
          key={screen.selectedDate}
          date={screen.selectedDate}
          grid={screen.selectedGrid}
          themes={screen.themes}
          scheduleAction={scheduleGridAction}
        />
      </section>
    </div>
  )
}
