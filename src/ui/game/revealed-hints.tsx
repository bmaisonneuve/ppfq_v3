import { HINT_LABELS } from '@/shared/play'
import { flagUrl } from '@/shared/nationality'
import type { HintClubLine, RevealedHint } from '@/shared/play'

/**
 * L'échelle de dévoilement, as the joueur reads it.
 *
 * Presentational and nothing else: what it is handed has already been paid for
 * — the server sends exactly the tiers the erreurs earned and never one more
 * (`server/domain/reveal-ladder.ts`) — so there is no field here to be careful
 * about and nothing to hide.
 *
 * Two things in it are rules rather than styling:
 *
 * - **The order is the specs' order** and it is the server's, not a sort here.
 *   Décennie, durée par club, nationalité, matchs en championnat, buts en
 *   championnat (specs §3).
 * - **Tiers 4 and 5 say « en championnat »**, and that wording is the hint. The
 *   source counts neither the domestic cups nor the European competitions, so a
 *   joueur who knows his figures would read a bare "matchs" as a mistake — and
 *   on a hint, confidence is worth more than precision. The words live in
 *   `HINT_LABELS`, once.
 *
 * Everything stays on screen until the end of the partie, which costs nothing
 * to arrange: the tiers arrive whole on every answer, so a reload finds them.
 */
export function RevealedHints({ hints }: Readonly<{ hints: readonly RevealedHint[] }>) {
  if (hints.length === 0) return null

  return (
    <dl className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
      {hints.map((hint) => (
        <div key={hint.tier} className="flex flex-col gap-1">
          <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {HINT_LABELS[hint.tier]}
          </dt>
          <dd className="text-sm text-neutral-900">
            <HintValue hint={hint} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One tier's value.
 *
 * A `switch` over the union, so the day a tier is added this is a compile error
 * rather than a blank line on screen.
 */
function HintValue({ hint }: Readonly<{ hint: RevealedHint }>) {
  switch (hint.tier) {
    case 1:
      // The decade and never the year: the years would hand over the rest.
      return <span>{hint.decade === null ? UNKNOWN : `années ${hint.decade}`}</span>
    case 2:
      return <ClubLines lines={hint.durations} unit={seasons} />
    case 3:
      return <NationalityValue nationality={hint.nationality} />
    case 4:
      return <ClubLines lines={hint.matches} unit={countOf('match', 'matchs')} />
    case 5:
      return <ClubLines lines={hint.goals} unit={countOf('but', 'buts')} />
  }
}

/**
 * A per-club hint, one line per passage, in the order of the parcours.
 *
 * The club name is printed rather than the list being aligned by index with the
 * parcours above. It costs nothing — the parcours is public and already on
 * screen — and it is what keeps the hint readable on its own, whatever the
 * layout does. A club crossed twice appears twice, at its two places.
 */
function ClubLines({
  lines,
  unit,
}: Readonly<{ lines: readonly HintClubLine[]; unit: (figure: number) => string }>) {
  return (
    <ul className="flex flex-col gap-0.5">
      {lines.map((line, index) => (
        // A club crossed twice is two passages at two places in the chronology,
        // so the club name is not a key. The index is: the order is the
        // server's and this list is never reordered here.
        <li key={index} className="flex items-baseline justify-between gap-3">
          <span className="text-neutral-600">{line.clubName}</span>
          <span className="font-medium">
            {line.figure === null ? UNKNOWN : unit(line.figure)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The nationality, with its flag.
 *
 * A plain `<img>` and not `next/image`: the bytes are an already-rendered
 * 192 px WebP served from our own origin at a content-addressed URL, cached
 * for ever (`shared/nationality.ts`). There is nothing for an optimiser to do.
 */
function NationalityValue({
  nationality,
}: Readonly<{ nationality: { frName: string; flagKey: string | null } | null }>) {
  if (nationality === null) return <span>{UNKNOWN}</span>

  return (
    <span className="flex items-center gap-2">
      {nationality.flagKey === null ? null : (
        <img
          src={flagUrl(nationality.flagKey)}
          alt=""
          className="h-4 w-auto rounded-xs border border-neutral-200"
        />
      )}
      <span className="font-medium">{nationality.frName}</span>
    </span>
  )
}

/**
 * What a hint says when the catalogue does not know.
 *
 * Not reachable by scheduling — an admin cannot programme a footballer whose
 * matchs, buts or nationalité are missing (`shared/schedule.ts`) — and reachable
 * all the same: an enigma designates a footballer and copies nothing from him
 * (ADR-0001), so an import can empty a column under a grid already published.
 * Saying so beats a blank where a hint should be, three essais in.
 */
const UNKNOWN = 'non renseigné'

const seasons = (figure: number) => (figure === 1 ? '1 saison' : `${figure} saisons`)

/** French, so only a figure above one takes the plural. */
const countOf = (one: string, many: string) => (figure: number) =>
  `${figure} ${figure > 1 ? many : one}`
