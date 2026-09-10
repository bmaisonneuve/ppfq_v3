import { getDailyGrid } from '@/server/services/grid.service'
import { DailyGridView, NoGridView } from '@/ui/game/daily-grid'

/**
 * La grille du jour : trois énigmes accessibles d'emblée — aucune n'attend
 * qu'une autre soit trouvée — chacune montrant le parcours complet d'un
 * footballeur. Accessibles, et non toutes dépliées : une partie naît à
 * l'ouverture d'une énigme (#8).
 *
 * ## The route reads no cookie, and that is the architecture
 *
 * This page reads no cookie, no header and no search parameter, so Next
 * prerenders it and serves it from the full route cache, with a
 * `Cache-Control` a CDN understands. Cloudflare then caches the *whole page*
 * and a hit costs the origin nothing — which is the only thing that absorbs
 * the peak of midnight: not 15 requests a second on average, but possibly
 * 20 000 people in five minutes (docs/stack-technique.md §10). The grid being
 * identical for everyone is what makes that free.
 *
 * The property we get on the way is worth as much as the performance: a page
 * that structurally contains no personal data and no hint cannot leak one
 * through a shared cache. Impossible by construction rather than by vigilance
 * — `test/architecture/static-game-page.test.ts` is what keeps it that way, and
 * `server/services/grid.service.ts` is where the answer is left behind.
 *
 * The price is a brief loading state on the personal zones alone (my tries, the
 * hints I have already uncovered, my streak), fetched after hydration by a
 * request of their own — `POST /api/game/state`, and ADR-0009 for why that is
 * a POST. The parcours, which *is* the enigma, is there in the first paint.
 */

/**
 * How long a rendered grid is kept — 60 seconds, and not a day.
 *
 * A day is what the ticket asks for and it is the wrong number *today*, for one
 * reason: the revalidation clock starts when the entry is generated, not at
 * Paris midnight. `revalidate = 86400` would hold whatever grid was rendered
 * for a full day from whenever that happened to be, so the grid would turn at
 * an arbitrary hour of the following day instead of at midnight — the one
 * moment of the day when being wrong is visible to everybody at once.
 *
 * Sixty seconds bounds that to a minute, and costs almost nothing: Next answers
 * `s-maxage=60, stale-while-revalidate=…`, so a stale entry is still served
 * from the edge while one render refreshes it behind the visitors' backs. The
 * origin sees a query a minute, and no player ever waits for it.
 *
 * The exact turn is the daily pre-warm job of #15 (`cache_revalidate`): it
 * revalidates this path just after Paris midnight and purges the CDN alongside,
 * an on-demand invalidation being the only thing that can land on a clock. The
 * day it exists, this number goes back up to a day — the grid then turns
 * because something says so, not because a timer happened to expire.
 */
export const revalidate = 60

export default async function GamePage() {
  const grid = await getDailyGrid()

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      {grid === null ? <NoGridView /> : <DailyGridView grid={grid} />}
    </main>
  )
}
