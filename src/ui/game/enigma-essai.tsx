'use client'

import { MAX_TRIES } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'
import { FootballerTypeahead } from '@/ui/footballer-typeahead'

import { RevealedHints } from './revealed-hints'

/**
 * L'essai, as the joueur plays it: the hints already uncovered, the input, and
 * the button that gives one up.
 *
 * ## Three gestures, one cost
 *
 * Proposing a footballer, proposing one already proposed, and passing his turn
 * all consume one essai and all uncover the next hint (specs §3, §10). So there
 * is one handler here and no branch: the typeahead sends an identifier, the
 * button sends `null`, and what happens next is the server's business.
 *
 * There is no fourth gesture, and there cannot be: the input is a **selection
 * in a list**, so a name that is not a footballer is unreachable — the joueur
 * cannot type one, let alone submit it. That is the whole reason the answer has
 * three forms and not four.
 *
 * ## What the disabled button is for
 *
 * `pending` is the first half of the double-submission guard, and the cheap
 * half: a double-clic that never leaves the browser costs nothing to refuse.
 * The other half is on the server, where the same proposition inside two
 * seconds is ignored — because a disabled button is a suggestion and not a
 * protection, and the doublon *costing* an essai is what made the difference
 * matter (`docs/stack-technique.md` §4).
 *
 * ## The counter says what is left, not what is spent
 *
 * The hints are the thing that changes on screen, so the essais have to be
 * legible at a glance beside them — « il reste 3 essais » is what a joueur
 * decides on when he weighs passing his turn.
 */
export function EnigmaEssai({
  play,
  pending,
  onSubmit,
}: Readonly<{
  /** Undefined while the personal request is in flight, or when never opened. */
  play: EnigmaPlay | undefined
  pending: boolean
  onSubmit: (footballerId: string | null) => void
}>) {
  // Nothing to play on: the personal state has not landed, or this enigma was
  // never opened. The parcours above is unaffected — it came with the page.
  if (play === undefined) return null

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 px-5 py-4">
      <RevealedHints hints={play.hints} />

      {play.status === 'in_progress' ? (
        <Essai pending={pending} triesUsed={play.triesUsed} onSubmit={onSubmit} />
      ) : (
        <Outcome play={play} />
      )}
    </div>
  )
}

/** The input and the button that passes — the two ways to spend an essai. */
function Essai({
  pending,
  triesUsed,
  onSubmit,
}: Readonly<{
  pending: boolean
  triesUsed: number
  onSubmit: (footballerId: string | null) => void
}>) {
  return (
    <div className="flex flex-col gap-3">
      {/* Not disabled by `pending`, unlike the button: picking a suggestion is a
          deliberate act each time, and two picks are two essais. What a double-
          clic on a suggestion would do is nothing — choosing empties the query
          and closes the list, so the second click lands on no list at all. */}
      <FootballerTypeahead
        label="Proposez un footballeur"
        onSelect={(suggestion) => {
          onSubmit(suggestion.footballerId)
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-600">{remaining(triesUsed)}</span>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onSubmit(null)
          }}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {/* « Passer » and not « indice » : the coup de pouce was dropped and
              replaced by this, and it costs an essai exactly like an erreur
              (specs §3). Calling it a hint would promise something free. */}
          {pending ? 'Envoi…' : 'Passer mon tour'}
        </button>
      </div>
    </div>
  )
}

/**
 * The end of a partie, and the only moment the footballer has a name.
 *
 * Before this, no answer of the server carries it at all (specs §10.1) — so
 * there is no field to forget to hide here, and `answer` being null while a
 * partie is playable is not a precaution taken twice, it is the same one seen
 * from the client.
 *
 * A partie can end without an answer to show: an import can empty a parcours
 * under a grid already published (ADR-0001), and the enigma then has no
 * footballer left to name. Saying the partie is over is still true and still
 * useful.
 */
function Outcome({ play }: Readonly<{ play: EnigmaPlay }>) {
  const solved = play.status === 'solved'

  return (
    <p
      className={`rounded-md px-4 py-2 text-sm ${
        solved ? 'bg-emerald-50 text-emerald-900' : 'bg-neutral-100 text-neutral-800'
      }`}
    >
      {solved ? 'Trouvé' : 'Partie terminée'}
      {play.answer === null ? '.' : ` : ${play.answer}.`}
    </p>
  )
}

/** French, so one is singular: « il reste 1 essai ». */
function remaining(triesUsed: number): string {
  const left = Math.max(0, MAX_TRIES - triesUsed)
  return `Il reste ${left} essai${left > 1 ? 's' : ''}`
}
