'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { POSITION_LABELS } from '@/shared/schedule'
import { describePlay } from '@/shared/play'
import type { DailyGrid, Enigma } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { Position } from '@/shared/schedule'

import { EnigmaEssai } from './enigma-essai'
import { PlayerStatsPanel } from './player-stats'
import { isStaleGrid, playAt, useDayPlays } from './use-day-plays'

/**
 * The three enigmas of la grille du jour, and the fold that decides how many
 * parties are born.
 *
 * Three properties of this list are game rules and not styling:
 *
 * - **All three are present.** No sequential unlock: being stuck on the
 *   échauffement must not cost the rest of the day (specs §2).
 * - **They are not all unfolded.** A partie is born when an enigma is *opened*
 *   (`docs/modele-donnees.md` §4), so three unfolded at once would measure
 *   three people exposed where one arrived. The échauffement is open and the
 *   other two are folded — which is also the reading order of a difficulty
 *   that rises.
 * - **Unfolding is what opens.** The fold is therefore no longer free: it is
 *   the gesture that creates the partie, which is why this component is a
 *   client one and the `<details>` are controlled. Before this ticket the fold
 *   worked without JavaScript; the parcours still renders in the first paint,
 *   because a client component is server-rendered too — what needs hydration is
 *   the *consequence* of opening, not the enigma.
 *
 * That last point leaves a window, and it is not theoretical on a page that
 * 20 000 people open in five minutes: a `<details>` unfolds **natively**, so a
 * joueur who taps the titulaire between the first paint and hydration opens the
 * enigma and creates nothing — the gesture arrived before the handler. Nothing
 * in React knows it happened, so hydration asks the DOM what is open instead of
 * assuming it knows.
 *
 * Everything personal comes down from one hook and nothing here computes any of
 * it: the summary is `describePlay`, the essai and the hints are
 * `enigma-essai.tsx`, and both are handed an `EnigmaPlay` the server built. A
 * partie carries what it has earned and nothing else — the hints its erreurs
 * paid for, and the name of the footballer only once it is over
 * (`shared/play.ts`).
 *
 * Les statistiques du joueur sont rendues sous la liste par ce même composant,
 * et c'est la file qui l'impose plutôt que la mise en page : elles arrivent par
 * une porte à elles (ADR-0013) mais **sur la file de ce hook**, parce qu'une
 * requête personnelle hors de cette file est un second joueur qui se crée
 * (ADR-0009). Ce qui les fetch est donc ici, et ce qui les dessine est
 * `player-stats.tsx`, qui ne calcule rien non plus.
 */
export function EnigmaList({ grid }: Readonly<{ grid: DailyGrid }>) {
  // The first by its rank in the list rather than by `position === 1`: a grid
  // that somehow lacks its échauffement would otherwise open nothing, and the
  // parcours has to be visible from the start.
  const first = grid.enigmas[0]?.position

  const { state, open, submit, pending, stats } = useDayPlays(grid.date, first)
  const [unfolded, setUnfolded] = useState<ReadonlySet<Position>>(
    () => new Set(first === undefined ? [] : [first]),
  )
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    // What was unfolded before React arrived — see the note above. The `<ol>`
    // renders one `<details>` per enigma, in the same order, and this is the
    // only place that leans on that.
    const details = list.current?.querySelectorAll('details')
    if (details === undefined) return

    const opened = grid.enigmas.flatMap((enigma, index) =>
      details[index]?.open === true ? [enigma.position] : [],
    )

    setUnfolded((current) => {
      const next = new Set([...current, ...opened])
      // The same set, by reference, when nothing was tapped early: a new one
      // every time would be a render that schedules itself again.
      return next.size === current.size ? current : next
    })
    // Idempotent per position, so the enigma that starts unfolded — already
    // opened by the hook's own hydration request — is not asked for twice.
    for (const position of opened) open(position)
  }, [grid.enigmas, open])

  function toggle(position: Position, isOpen: boolean): void {
    setUnfolded((current) => {
      const next = new Set(current)
      if (isOpen) next.add(position)
      else next.delete(position)
      return next
    })

    // Folding an enigma back does not close the partie — nothing does, until an
    // essai finishes it or the day takes it away.
    if (isOpen) open(position)
  }

  return (
    <div className="flex flex-col gap-3">
      {isStaleGrid(state, grid.date) ? <StaleGridNotice /> : null}

      <ol ref={list} className="flex flex-col gap-3">
        {grid.enigmas.map((enigma) => (
          <li key={enigma.position}>
            <EnigmaCard
              enigma={enigma}
              open={unfolded.has(enigma.position)}
              play={playAt(state, enigma.position)}
              loading={state.status === 'loading'}
              pending={pending.has(enigma.position)}
              onToggle={toggle}
              onSubmit={submit}
            />
          </li>
        ))}
      </ol>

      <PlayerStatsPanel stats={stats} />

      {state.status === 'unavailable' ? <UnavailableNotice /> : null}
    </div>
  )
}

/**
 * One enigma: its position, the parcours that *is* the question, and what the
 * joueur has already spent on it.
 *
 * The number of clubs is on the folded summary because it is public by
 * construction — the parcours is shown whole, so counting it is free — and
 * because a fold with nothing behind it is a fold nobody opens.
 *
 * The partie is on the summary and **only** there, which is the one place that
 * serves both states: a summary stays visible when the enigma is unfolded, so
 * saying it twice would say it twice on screen. It is also what makes a reload
 * show at a glance that the three enigmas are where the joueur left them —
 * without unfolding any of them, and so without opening a single new partie.
 */
function EnigmaCard({
  enigma,
  open,
  play,
  loading,
  pending,
  onToggle,
  onSubmit,
}: Readonly<{
  enigma: Enigma
  open: boolean
  play: EnigmaPlay | undefined
  loading: boolean
  pending: boolean
  onToggle: (position: Position, isOpen: boolean) => void
  onSubmit: (position: Position, footballerId: string | null) => void
}>) {
  return (
    <details
      open={open}
      onToggle={(event) => {
        onToggle(enigma.position, event.currentTarget.open)
      }}
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
          <Partie play={play} loading={loading} />
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

      {/* The essai, the hints and — at the end, and only then — the answer.
          Below the parcours because the parcours *is* the question: it is in
          the first paint, and everything here waits for the personal request. */}
      <EnigmaEssai
        play={play}
        pending={pending}
        onSubmit={(footballerId) => {
          onSubmit(enigma.position, footballerId)
        }}
      />
    </details>
  )
}

/**
 * The partie, or what stands in for it.
 *
 * While the request is in flight it is a discreet ellipsis rather than a
 * skeleton that jumps: it is a few words next to an enigma that is already
 * fully readable. Once the answer is in and there is still no partie, there is
 * nothing to say — the joueur never opened this one, which is exactly what the
 * absence of a row records.
 */
function Partie({
  play,
  loading,
}: Readonly<{ play: EnigmaPlay | undefined; loading: boolean }>) {
  if (play !== undefined) {
    return (
      <span className="ml-2 text-sm font-medium text-neutral-700">{describePlay(play)}</span>
    )
  }
  // It carries its own margin, so an enigma with no partie leaves no gap where
  // one would have been.
  if (loading) return <span className="ml-2 text-sm text-neutral-400">…</span>

  return null
}

/**
 * The grid on screen is no longer the grid of the day.
 *
 * The page is prerendered and served from a shared cache for up to a minute
 * (ADR-0008), so somebody arriving at midnight can be holding yesterday's grid.
 * The server will not open a partie on it — nothing he did would be recorded —
 * so saying so, once, beats letting him play into a void.
 */
function StaleGridNotice() {
  return (
    <Notice>
      La grille du jour a changé depuis l’ouverture de cette page.{' '}
      <button
        type="button"
        onClick={() => {
          window.location.reload()
        }}
        className="underline underline-offset-2"
      >
        Recharger
      </button>
    </Notice>
  )
}

/**
 * The personal state could not be read.
 *
 * It says so rather than showing zero essais everywhere: "no partie" and "we
 * could not ask" look identical on screen and only one of them is true. The
 * parcours is unaffected — it came with the page.
 */
function UnavailableNotice() {
  return <Notice>Votre progression n’a pas pu être chargée.</Notice>
}

function Notice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
      {children}
    </p>
  )
}

const clubCount = (clubs: number) => (clubs === 1 ? '1 club' : `${clubs} clubs`)
