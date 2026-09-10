import { POSITION_LABELS } from '@/shared/schedule'
import type { DailyGrid, Enigma } from '@/shared/grid'

/**
 * La grille du jour, as the player reads it.
 *
 * Presentational and nothing else: what it is handed is already everything a
 * player may see, so there is no field here to be careful about. That is the
 * shape of the whole page — the shell is public and static, and the personal
 * part (my tries, the hints I have already uncovered, my streak) arrives later
 * over a request of its own (#8).
 *
 * Three properties of the markup are game rules and not styling:
 *
 * - **The three enigmas are all present.** No sequential unlock: being stuck on
 *   the échauffement must not cost the rest of the day (specs §2).
 * - **They are not all unfolded.** A partie is born when an enigma is *opened*,
 *   not at the first try (#8), and three parties born together would measure
 *   three people exposed where there was one. So the échauffement is open and
 *   the other two are folded — which is also the reading order of a difficulty
 *   that rises.
 * - **`<details>` and not a click handler.** The fold costs no JavaScript and
 *   works before hydration, on a page whose whole point is to be prerendered
 *   once a day and served from a shared cache.
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

      <ol className="flex flex-col gap-3">
        {grid.enigmas.map((enigma, index) => (
          <li key={enigma.position}>
            {/* The first one, by its rank in the list rather than by
                `position === 1`: a grid that somehow lacks its échauffement
                would otherwise open nothing, and the parcours has to be
                visible from the start. */}
            <EnigmaCard enigma={enigma} open={index === 0} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * One enigma: its position, and the parcours that *is* the question.
 *
 * The number of clubs is on the folded summary because it is public by
 * construction — the parcours is shown whole, so counting it is free — and
 * because a fold with nothing behind it is a fold nobody opens.
 */
function EnigmaCard({ enigma, open }: Readonly<{ enigma: Enigma; open: boolean }>) {
  return (
    <details
      open={open}
      className="group rounded-lg border border-neutral-200 bg-white open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 marker:hidden">
        <span>
          <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {enigma.position}. {POSITION_LABELS[enigma.position]}
          </span>
          <span className="ml-2 text-sm text-neutral-500">
            {clubCount(enigma.passages.length)}
          </span>
        </span>
        {/* The native triangle is hidden, so the affordance is written out —
            a folded enigma with no visible way in is an enigma nobody opens. */}
        <span className="shrink-0 text-sm text-neutral-500 group-open:hidden">déplier</span>
        <span className="hidden shrink-0 text-sm text-neutral-500 group-open:inline">
          replier
        </span>
      </summary>

      {/* The parcours: the clubs in chronological order, and nothing else. No
          dates, no nationality, no figures — those are the hint tiers, and they
          are revealed over a request that knows who is asking. */}
      <ol className="flex flex-col gap-1 border-t border-neutral-100 px-4 py-3">
        {enigma.passages.map((passage, index) => (
          <li
            // A club crossed twice is two passages, at their two places in the
            // chronology, so the club name is not a key. The index is: this
            // list is prerendered once a day and never reordered.
            key={index}
            className="flex items-baseline gap-2 text-base"
          >
            <span className="w-5 shrink-0 text-sm text-neutral-400">{index + 1}</span>
            <span>{passage.clubName}</span>
            {passage.isLoan ? (
              /* An annotation next to the club, never a club of its own. */
              <span className="text-sm text-neutral-500">(prêt)</span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  )
}

const clubCount = (clubs: number) => (clubs === 1 ? '1 club' : `${clubs} clubs`)

/**
 * A day with no grid.
 *
 * The absence of a `daily_challenges` row *is* the hole
 * (docs/modele-donnees.md §4), and the player is the last person who should
 * learn about it: the weekly alert and the health route (#14, #15) read the
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
