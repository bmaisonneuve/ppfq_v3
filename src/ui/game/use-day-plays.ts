'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { GAME_STATE_PATH, isGridOfDay } from '@/shared/play'
import type { DayPlays, EnigmaPlay } from '@/shared/play'
import type { ChallengeDate, Position } from '@/shared/schedule'

/**
 * L'état personnel of the grid on screen, fetched after hydration.
 *
 * The page itself carries no trace of it: la grille du jour is prerendered and
 * served whole from a shared cache (ADR-0008), so the parcours — which *is* the
 * enigma — is in the first paint, and everything that belongs to one person
 * arrives here, over a POST that knows who is asking and is cached by nobody.
 * The price is a brief loading state on the personal zones alone, and it is the
 * price of a page that cannot leak a joueur's state to another joueur.
 *
 * ## Opening an enigma is what creates the partie
 *
 * Not the first essai (`docs/modele-donnees.md` §4). So `open` is called on
 * hydration for the enigma that starts unfolded, and again each time the joueur
 * unfolds another one — never for all three at once, or one arrival would
 * measure three people exposed. The server answers the state of the whole grid
 * every time, which is what makes a reload cheap: one request, and the parties
 * already there come back with the one being opened.
 *
 * ## The requests are chained, and that is not tidiness
 *
 * It is the difference between one joueur and two. A first visitor carries no
 * cookie, so *every* request in flight without one is a joueur being created:
 * unfold the titulaire before the first answer lands and the browser ends up
 * with two `players` rows, keeps whichever `Set-Cookie` arrived last, and loses
 * the partie attached to the other — on the very reload this ticket exists to
 * make work. Nothing on the server can see that two cookie-less requests are
 * one browser, so the fix is here: one request at a time, in order, the first
 * one establishing the identity the rest carry.
 *
 * Chaining also settles what parallel requests made delicate. Each answer is
 * the whole state of the day, so the last one to run is by definition the
 * freshest — there is no out-of-order answer left to detect.
 *
 * ## What a failure must not do
 *
 * It must not leave the personal zones spinning for ever, and it must not claim
 * the joueur has no partie either — those two are indistinguishable from an
 * empty answer, and one of them is a lie. So it says `unavailable`, the
 * interface says so too, and the enigma is forgotten rather than remembered as
 * asked: unfolding it again is then a real retry.
 */

/** The state of the personal zones: loading, loaded, or missing. */
export type PersonalState =
  | { status: 'loading' }
  | {
      status: 'ready'
      /** Only the enigmas actually opened have a partie. */
      plays: ReadonlyMap<Position, EnigmaPlay>
      /** Today in Paris, as the server sees it — the page may be older. */
      today: ChallengeDate
    }
  | { status: 'unavailable' }

const LOADING: PersonalState = { status: 'loading' }

/**
 * The personal state of one grid, and the one action that changes it.
 *
 * `first` is the enigma that starts unfolded, and it is opened on hydration.
 * It is optional because a grid with no enigma is a state the database allows
 * and the page renders (`grid.service.ts`): there is then nothing to open, and
 * nothing to open it with.
 */
export function useDayPlays(
  date: ChallengeDate,
  first: Position | undefined,
): { state: PersonalState; open: (position: Position) => void } {
  const [state, setState] = useState<PersonalState>(LOADING)

  // One request at a time, in the order they were asked for. See above: this
  // is what keeps a first visitor from becoming two joueurs.
  const queue = useRef<Promise<void>>(Promise.resolve())
  // What has already been asked for, so unfolding an enigma twice is one
  // request — and a request that failed is dropped from it, so a second
  // unfolding retries.
  const asked = useRef(new Set<Position>())
  // The hydration request, once. React runs an effect twice in development.
  const started = useRef(false)

  const load = useCallback(
    (open: Position | undefined): void => {
      queue.current = queue.current.then(async () => {
        try {
          const response = await fetch(GAME_STATE_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, open }),
          })
          if (!response.ok) throw new Error(String(response.status))

          const day = (await response.json()) as DayPlays

          setState({
            status: 'ready',
            plays: new Map(day.plays.map((play) => [play.position, play])),
            today: day.today,
          })
        } catch {
          // Offline, a 500, a malformed answer.
          if (open !== undefined) asked.current.delete(open)
          setState((current) =>
            current.status === 'ready' ? current : { status: 'unavailable' },
          )
        }
      })
    },
    [date],
  )

  useEffect(() => {
    // After hydration, and only then: this is the request the page does not
    // make. The enigma that starts unfolded is opened by the same call.
    if (started.current) return
    started.current = true

    if (first !== undefined) asked.current.add(first)
    load(first)
  }, [first, load])

  const open = useCallback(
    (position: Position): void => {
      if (asked.current.has(position)) return
      asked.current.add(position)
      load(position)
    },
    [load],
  )

  return { state, open }
}

/** The partie on one enigma, or undefined while loading or when never opened. */
export function playAt(state: PersonalState, position: Position): EnigmaPlay | undefined {
  return state.status === 'ready' ? state.plays.get(position) : undefined
}

/**
 * Whether the grid on screen is no longer the grid of the day.
 *
 * A real case rather than a defensive one: the page is served from a shared
 * cache for up to a minute (ADR-0008), so somebody arriving at midnight can be
 * holding the grid of the day before. The server refuses to open a partie on it
 * — nothing the joueur did would be recorded — so the interface has to say so
 * rather than let him play into a void.
 *
 * Which day it is comes from the answer and never from the browser: the client
 * has no way to know how old the page it is holding is.
 */
export function isStaleGrid(state: PersonalState, date: ChallengeDate): boolean {
  return state.status === 'ready' && !isGridOfDay(date, state.today)
}
