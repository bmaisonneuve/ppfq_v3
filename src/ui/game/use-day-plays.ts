'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { GAME_STATE_PATH, GAME_TRY_PATH, isGridOfDay } from '@/shared/play'
import type { DayPlays, EnigmaPlay } from '@/shared/play'
import type { ChallengeDate, Position } from '@/shared/schedule'
import type { FootballerSuggestion } from '@/shared/search'
import { GAME_STATS_PATH } from '@/shared/stats'
import type { PlayerStats } from '@/shared/stats'

import { verdictOf } from './verdict'
import type { Verdict } from './verdict'

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
 * Not the first essai (`docs/modele-donnees.md` §4). So the request made on
 * hydration opens **nothing**: the page shows three cards and no enigma, and an
 * arrival is an arrival. `open` is called when the joueur opens one, and never
 * for all three at once, or one arrival would measure three people exposed. The
 * server answers the state of the whole grid every time, which is what makes a
 * reload cheap: one request, and every partie already there comes back with the
 * one being opened.
 *
 * ## The requests are chained, and that is not tidiness
 *
 * It is the difference between one joueur and two. A first visitor carries no
 * cookie, so *every* request in flight without one is a joueur being created:
 * open the titulaire before the first answer lands and the browser ends up with
 * two `players` rows, keeps whichever `Set-Cookie` arrived last, and loses the
 * partie attached to the other — on the very reload this ticket exists to make
 * work. Nothing on the server can see that two cookie-less requests are
 * one browser, so the fix is here: one request at a time, in order, the first
 * one establishing the identity the rest carry.
 *
 * Chaining also settles what parallel requests made delicate. Each answer is
 * the whole state of the day, so the last one to run is by definition the
 * freshest — there is no out-of-order answer left to detect.
 *
 * ## The essai rides the same queue, and that is the point
 *
 * `POST /api/game/try` creates a `players` row for a caller with no cookie
 * exactly as the state request does, so an essai racing the request that opens
 * the enigma would make the same two joueurs. One queue for both, and the
 * ordering falls out: an essai cannot overtake the open that made its partie.
 *
 * What comes back from an essai is a whole `EnigmaPlay` — the same value the
 * state request carries — so there is nothing to merge and nothing to compute
 * here. The three forms the specs ask for are its three statuses, and the hints
 * it carries are the ones already earned. The client counts nothing, decides
 * nothing, and therefore cannot disagree with the server about a partie.
 *
 * ## Les statistiques passent par la même file, et c'est pour ça qu'elles sont ici
 *
 * Elles ont leur propre porte — `POST /api/game/stats`, ADR-0013 — parce que le
 * chemin du pic ne doit pas payer un `GROUP BY` pour un panneau que la plupart
 * des requêtes n'affichent pas. Mais elles ne peuvent pas avoir leur propre
 * file : cette porte-là crée elle aussi un joueur pour un appelant sans cookie,
 * donc une requête de statistiques lancée à côté de la première requête d'état
 * ferait exactement les deux lignes `players` que tout ce qui précède existe
 * pour éviter. Une file, une identité — les statistiques s'y rangent comme le
 * reste.
 *
 * Elles sont relues quand une partie **se termine**, et à ce moment-là
 * seulement : c'est le seul essai qui bouge un agrégat (`stats.service.ts`).
 * Trouver le titulaire fait donc avancer la série sous les yeux du joueur, sans
 * qu'une partie perdue ou un simple faux coûte une requête.
 *
 * ## What a failure must not do
 *
 * It must not leave the personal zones spinning for ever, and it must not claim
 * the joueur has no partie either — those two are indistinguishable from an
 * empty answer, and one of them is a lie. So it says `unavailable`, the
 * interface says so too, and the enigma is forgotten rather than remembered as
 * asked: opening it again is then a real retry.
 *
 * A **refused** essai is not that kind of failure. The seventh essai, a grid
 * that has turned, an enigma reprogrammed under an open page: the server knows
 * why and the client does not need to. It re-reads the state and shows what is
 * actually there, which is right for all three without telling them apart.
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
 * The personal state of one grid, and the two actions that change it.
 *
 * It opens nothing of its own accord. The hydration request reads the day and
 * that is all: which enigma becomes a partie is the joueur's gesture, and this
 * hook learns of it through `open`.
 *
 * ## Une journée sans grille est une journée quand même
 *
 * `date` vaut `null` le jour où rien n'est programmé, et il ne reste alors
 * qu'une chose à ne pas faire : demander l'état d'une journée qui n'existe pas.
 * Le reste tient — la file, les statistiques, et donc le compte qui s'y range —
 * parce que le joueur, lui, existe tous les jours : il a une série derrière lui
 * et une adresse à connecter, et rien de cela n'attend qu'on ait programmé une
 * grille. `state` reste donc `loading` et personne ne le lit : l'écran de ce
 * jour-là n'affiche aucune zone de partie (`no-grid.tsx`).
 */
export function useDayPlays(date: ChallengeDate | null): {
  state: PersonalState
  open: (position: Position) => void
  /** One essai: a footballer proposed, or `null` for a tour passé. */
  submit: (position: Position, proposal: FootballerSuggestion | null) => void
  /**
   * Ce que le dernier essai vient de faire — et non ce que la partie est
   * devenue.
   *
   * Les deux ne se déduisent pas l'un de l'autre : une partie dit qu'elle a
   * trois essais dépensés et deux indices, jamais qu'elle vient de le devenir.
   * Il est calculé ici parce que c'est ici, et nulle part ailleurs, qu'on tient
   * encore la partie **d'avant** (`verdict.tsx`) — une fois l'état remplacé,
   * elle n'existe plus.
   *
   * Il vaut `null` tant qu'aucun essai n'a été joué de la visite, et il n'est
   * jamais remis à `null` ensuite : c'est un écran qui décide combien de temps
   * un verdict est un instant, pas cette file.
   */
  verdict: Verdict | null
  /** The enigmas with an essai in flight — what disables a form. */
  pending: ReadonlySet<Position>
  /**
   * Les agrégats du joueur. Trois états et non deux : `undefined` tant qu'on ne
   * les a pas lus, `null` quand la lecture a échoué. « Pas encore » et « pas
   * pu » se ressemblent à l'écran et ne se disent pas pareil.
   */
  stats: PlayerStats | null | undefined
  /**
   * La file elle-même, pour ce qui n'est pas une partie.
   *
   * Le compte (#13) s'y range : `POST /api/account/sign-in` repose le cookie du
   * joueur — la reprise de progression vient peut-être de désigner une autre
   * ligne `players` — et une requête d'état qui reviendrait après lui
   * reposerait l'ancienne valeur. Une file, une identité, et la règle ne
   * souffre pas d'exception parce qu'elle en souffrirait mal : ce qui est hors
   * de la file est ce qui double un joueur.
   */
  enqueue: (task: () => Promise<void>) => void
} {
  const [state, setState] = useState<PersonalState>(LOADING)
  // Undefined plutôt que des zéros : « pas encore lu » et « rien joué » se
  // ressemblent à l'écran et l'un des deux serait un mensonge. Le panneau dit
  // laquelle des deux il est en train de montrer.
  const [stats, setStats] = useState<PlayerStats | null | undefined>(undefined)
  // Counted rather than flagged: the queue is serial, so a second essai on the
  // same enigma waits behind the first — and a flag would be cleared by the
  // first one finishing while the second is still in flight, re-enabling a
  // button that should stay down.
  const [inFlight, setInFlight] = useState<ReadonlyMap<Position, number>>(() => new Map())
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  // One request at a time, in the order they were asked for. See above: this
  // is what keeps a first visitor from becoming two joueurs.
  const queue = useRef<Promise<void>>(Promise.resolve())
  // What has already been asked for, so opening an enigma twice is one request
  // — and a request that failed is dropped from it, so opening it again
  // retries.
  const asked = useRef(new Set<Position>())
  // The hydration request, once. React runs an effect twice in development.
  const started = useRef(false)
  /**
   * Les parties telles qu'elles viennent d'être posées, pour la seule question
   * qu'un `setState` ne sait pas répondre : **qu'y avait-il avant ?**
   *
   * Un doublon de l'état, donc, et assumé comme tel : le calcul du verdict
   * arrive après la réponse du serveur et hors du rendu, là où `state` n'est
   * qu'une variable capturée à la création du callback. La copie est écrite aux
   * deux seuls endroits qui posent des parties, juste à côté du `setState`
   * correspondant, ce qui est ce qui l'empêche de dériver.
   */
  const posed = useRef<ReadonlyMap<Position, EnigmaPlay>>(new Map())
  // Le rang de l'essai dans la visite : deux verdicts identiques doivent rester
  // deux verdicts (`verdict.tsx`).
  const serial = useRef(0)

  const readState = useCallback(
    async (open: Position | undefined): Promise<void> => {
      // Sans grille il n'y a pas de journée dont lire l'état. Le garde est ici
      // plutôt qu'aux trois appels : ce qui n'a pas de date n'a ni énigme à
      // ouvrir ni essai à poster, donc aucun d'eux ne peut arriver.
      if (date === null) return

      const day = await post<DayPlays>(GAME_STATE_PATH, { date, open })
      const plays = new Map(day.plays.map((play) => [play.position, play]))

      posed.current = plays
      setState({ status: 'ready', plays, today: day.today })
    },
    [date],
  )

  // Elle avale son propre échec, contrairement aux deux autres lectures : des
  // statistiques absentes ne sont pas une panne, et le jeu ne dépend de rien de
  // ce qu'elles disent. Elle le dit quand même — `null` et non `undefined` —
  // parce qu'on ne les voit plus que dans une fenêtre qu'on a ouverte exprès :
  // une question posée mérite une réponse, et « elles arrivent » en serait une
  // fausse.
  const readStats = useCallback(async (): Promise<void> => {
    try {
      setStats(await post<PlayerStats>(GAME_STATS_PATH))
    } catch {
      // Hors ligne, un 500, une réponse mal formée.
      setStats(null)
    }
  }, [])

  const load = useCallback(
    (open: Position | undefined): void => {
      queue.current = queue.current.then(async () => {
        try {
          await readState(open)
        } catch {
          // Offline, a 500, a malformed answer.
          if (open !== undefined) asked.current.delete(open)
          setState((current) =>
            current.status === 'ready' ? current : { status: 'unavailable' },
          )
        }
      })
    },
    [readState],
  )

  useEffect(() => {
    // After hydration, and only then: this is the request the page does not
    // make. It reads, and opens nothing — a partie is a gesture, not an
    // arrival.
    if (started.current) return
    started.current = true

    if (date !== null) load(undefined)

    // Derrière l'état, jamais à côté : la première requête est celle qui établit
    // l'identité, et celle-ci la porte. Sans grille, c'est elle qui l'établit —
    // la file n'a pas changé, seulement son premier maillon.
    queue.current = queue.current.then(readStats)
  }, [date, load, readStats])

  const open = useCallback(
    (position: Position): void => {
      if (asked.current.has(position)) return
      asked.current.add(position)
      load(position)
    },
    [load],
  )

  const submit = useCallback(
    (position: Position, proposal: FootballerSuggestion | null): void => {
      setInFlight((current) => counted(current, position, 1))

      queue.current = queue.current.then(async () => {
        try {
          const before = posed.current.get(position)
          const play = await post<EnigmaPlay>(GAME_TRY_PATH, {
            date,
            position,
            // « Passer » est une proposition de personne, et c'est la même
            // porte (`shared/play.ts`). Le nom ne voyage pas : le serveur a
            // l'identifiant, l'écran garde le nom pour le dire.
            footballerId: proposal?.footballerId ?? null,
          })

          // A whole partie replaces a whole partie. Nothing is incremented here
          // and no hint is appended: the server said what the partie is.
          posed.current = new Map(posed.current).set(play.position, play)
          setState((current) =>
            current.status === 'ready'
              ? { ...current, plays: new Map(current.plays).set(play.position, play) }
              : current,
          )

          // Null quand rien n'a été dépensé : le double-clic renvoie la partie
          // inchangée, et il ne se fête ni ne se pleure.
          const said = verdictOf({
            serial: serial.current + 1,
            before,
            after: play,
            proposed: proposal?.name ?? null,
          })

          if (said !== null) {
            serial.current = said.serial
            setVerdict(said)
          }

          // Une partie qui se termine est le seul essai qui bouge un agrégat.
          // On est déjà dans la file, donc c'est un `await` et non un appel qui
          // s'y range : la relecture suit l'essai qui l'a provoquée.
          if (play.status !== 'in_progress') await readStats()
        } catch (error) {
          // A refusal is not a breakdown: the server knows why — the seventh
          // essai, a grid that turned — and re-reading says so on screen.
          if (error instanceof RefusedTry) await readState(undefined).catch(() => undefined)
        } finally {
          setInFlight((current) => counted(current, position, -1))
        }
      })
    },
    [date, readState, readStats],
  )

  const enqueue = useCallback((task: () => Promise<void>): void => {
    queue.current = queue.current.then(async () => {
      // La file avale, comme partout ailleurs ici : une tâche qui lève ne doit
      // pas laisser la chaîne rejetée, sinon tout ce qui suit est abandonné
      // sans que personne ne l'ait décidé.
      await task().catch(() => undefined)
    })
  }, [])

  return {
    state,
    open,
    submit,
    verdict,
    pending: new Set([...inFlight.keys()]),
    stats,
    enqueue,
  }
}

/**
 * Une requête personnelle, pour ce qui n'est ni une partie ni un agrégat.
 *
 * Le même `post` que les portes du jeu, exporté parce que le compte parle aux
 * quatre siennes exactement pareil : POST, JSON, caché par personne. Il est
 * défini plus bas, avec les deux autres.
 */
export { post as personalPost }

/** The in-flight count of one enigma, moved by one, the map left immutable. */
function counted(
  current: ReadonlyMap<Position, number>,
  position: Position,
  delta: number,
): ReadonlyMap<Position, number> {
  const next = new Map(current)
  const count = (next.get(position) ?? 0) + delta

  if (count > 0) next.set(position, count)
  else next.delete(position)

  return next
}

/** An essai the server would not take. Its reason is its business, not ours. */
class RefusedTry extends Error {}

/**
 * One personal request: POST, JSON in, JSON out, cached by nobody.
 *
 * Both doors of the game answer the same way and fail the same way, so they
 * share this rather than each carrying its own `fetch`. A 409 is the only
 * status either of them gives a meaning to.
 */
async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    // Les statistiques n'ont rien à demander : le joueur est dans le cookie.
    // Un corps vide plutôt qu'un `{}` de politesse, et donc pas d'en-tête de
    // type à annoncer.
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })

  if (response.status === 409) throw new RefusedTry()
  if (!response.ok) throw new Error(String(response.status))

  return (await response.json()) as T
}

/** The partie on one enigma, or undefined while loading or when never opened. */
export function playAt(state: PersonalState, position: Position): EnigmaPlay | undefined {
  return state.status === 'ready' ? state.plays.get(position) : undefined
}

/**
 * Toutes les parties de la grille — la liste dont le résumé partagé se dérive.
 *
 * Vide tant que l'état n'est pas lu, et vide aussi quand il n'a pas pu l'être :
 * les deux disent « on ne sait pas », et le résumé ne se propose que sur ce
 * qu'on sait (`shared/summary.ts`). Il n'y a donc rien de plus à distinguer
 * ici — un partage offert sur une lecture ratée serait un bilan de trois
 * échecs, exactement ce que le garde-fou existe pour empêcher.
 */
export function playsOf(state: PersonalState): readonly EnigmaPlay[] {
  return state.status === 'ready' ? [...state.plays.values()] : []
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
