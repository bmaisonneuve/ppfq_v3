import { requireAdmin } from '@/server/services/admin-auth.service'
import { getSchedulingScreen } from '@/server/services/schedule.service'
import { ScheduleScreen } from '@/ui/admin/schedule-screen'

import { scheduleGridAction } from './actions'

/**
 * Le calendrier de programmation : un mois, et la grille d'un jour ouverte
 * au-dessus de lui.
 *
 * The screen has one read and no arithmetic of its own: routing may only reach
 * the server through a service, and the Europe/Paris calendar is a domain rule.
 * `getSchedulingScreen` resolves the month, the day a link may have named, and
 * today, on the other side of that door.
 *
 * Its URL carries the month — `?month=` — so a month can be linked to and
 * navigated back to. `?date=` is read on arrival and opens that day's window;
 * what happens to the window afterwards belongs to the screen and not to the
 * address bar (`ui/admin/schedule-screen.tsx`).
 */
export default async function SchedulePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string; date?: string }>
}>) {
  await requireAdmin()

  const { month, date } = await searchParams
  const screen = await getSchedulingScreen({ month, date })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title text-white">Calendrier de programmation</h1>

      <ScheduleScreen screen={screen} scheduleAction={scheduleGridAction} />
    </div>
  )
}
