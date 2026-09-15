import { requireAdmin } from '@/server/services/admin-auth.service'
import { getSchedulingScreen } from '@/server/services/schedule.service'
import { MonthCalendarView } from '@/ui/admin/month-calendar'

/**
 * Le calendrier de programmation : un mois, ses trous, et une case par jour.
 *
 * The screen has one read and no arithmetic of its own: routing may only reach
 * the server through a service, and the Europe/Paris calendar is a domain rule.
 * `getSchedulingScreen` resolves the month and today on the other side of that
 * door.
 *
 * Son URL porte le mois — `?month=` — donc un mois se lie et se retrouve. Le
 * jour, lui, a **sa propre page** (`schedule/[date]`) : la case du calendrier y
 * mène, et c'est de là que le mois se remplit. Cet écran ne programme rien, ce
 * qui est aussi pourquoi il n'a plus une ligne d'état.
 */
export default async function SchedulePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string }>
}>) {
  await requireAdmin()

  const { month } = await searchParams
  const screen = await getSchedulingScreen({ month })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title text-white">Calendrier de programmation</h1>

      <MonthCalendarView
        calendar={screen.calendar}
        today={screen.today}
        previousMonth={screen.previousMonth}
        nextMonth={screen.nextMonth}
      />
    </div>
  )
}
