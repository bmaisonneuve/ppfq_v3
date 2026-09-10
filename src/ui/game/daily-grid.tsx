import type { DailyGrid } from '@/shared/grid'

import { EnigmaList } from './enigma-list'

/**
 * La grille du jour, as the player reads it.
 *
 * Presentational and nothing else: what it is handed is already everything a
 * player may see, so there is no field here to be careful about. That is the
 * shape of the whole page — the shell is public and static, and the personal
 * part (my tries, the hints I have already uncovered, my streak) arrives later
 * over a request of its own, after hydration (#8).
 *
 * This half is the shell: the title and the theme, which are the same for
 * everybody and are in the prerendered HTML. The enigmas are `enigma-list.tsx`,
 * and they are a client component for one reason — unfolding an enigma is what
 * creates a partie, so the fold has a consequence on the server. The parcours
 * itself still renders in the first paint: a client component is
 * server-rendered too, and what waits for hydration is only the personal zone.
 */
export function DailyGridView({ grid }: Readonly<{ grid: DailyGrid }>) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">La grille du jour</h1>
        {/* The theme qualifies the whole day and is announced explicitly
            (specs §4). Free text, printed exactly as the admin typed it: the
            code classifies nothing and corrects nothing. */}
        <p className="text-neutral-600">
          Thème : <span className="font-medium text-neutral-900">{grid.theme}</span>
        </p>
      </header>

      <EnigmaList grid={grid} />
    </div>
  )
}

/**
 * A day with no grid.
 *
 * The absence of a `daily_challenges` row *is* the hole
 * (docs/modele-donnees.md §4), and the player is the last person who should
 * learn about it: the weekly alert and the health route (#15, #16) read the
 * same absence, days earlier. So this says what happened, plainly, and offers
 * nothing to click.
 */
export function NoGridView() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight">Pas de grille aujourd’hui</h1>
      <p className="text-neutral-600">
        Aucune grille n’est programmée pour la journée. Revenez demain.
      </p>
    </div>
  )
}
