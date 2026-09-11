/**
 * A day with no grid.
 *
 * The absence of a `daily_challenges` row *is* the hole
 * (docs/modele-donnees.md §4), and the player is the last person who should
 * learn about it: the weekly alert and the health route (#15, #16) read the
 * same absence, days earlier. So this says what happened, plainly, and offers
 * nothing to click.
 *
 * Its own file, and a server component, because it is the one screen of the
 * game with nothing to play: the grid itself is a client component and would
 * otherwise drag its whole bundle onto a page that has no enigma on it.
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
