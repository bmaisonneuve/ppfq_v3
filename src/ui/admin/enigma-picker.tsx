'use client'

import { useState } from 'react'

import type { FootballerSuggestion } from '@/shared/search'
import { POSITION_LABELS } from '@/shared/schedule'
import type { Position, ScheduledEnigma } from '@/shared/schedule'
import { FootballerTypeahead } from '@/ui/footballer-typeahead'

/**
 * Choosing the footballer of one position.
 *
 * The same typeahead the player uses, over the same referential — which is what
 * makes the choice honest: the admin picks from the 382 703 footballers of the
 * search index, and being suggested is not being schedulable. Whether this one
 * can carry an enigma is decided on submit, by the blocking checks, and the
 * refusal says why.
 *
 * The chosen id travels in a hidden field, in position order, so the form
 * submits three identifiers and nothing else — an enigma designates a
 * footballer and copies nothing from him (ADR-0001).
 */
export function EnigmaPicker({
  position,
  defaultEnigma,
}: Readonly<{
  position: Position
  /** What is already programmed at this position, when the day has a grid. */
  defaultEnigma?: ScheduledEnigma | null
}>) {
  const [chosen, setChosen] = useState<{ footballerId: string; name: string } | null>(
    defaultEnigma ?? null,
  )

  return (
    <div className="flex min-w-56 flex-1 flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">
        {position}. {POSITION_LABELS[position]}
      </span>

      {/* Empty rather than absent when nothing is chosen: the field has to be
          there for the server to say which position is missing. */}
      <input type="hidden" name="footballerId" value={chosen?.footballerId ?? ''} />

      {chosen === null ? (
        <FootballerTypeahead
          label={`Chercher le footballeur — ${POSITION_LABELS[position]}`}
          onSelect={(suggestion: FootballerSuggestion) => { setChosen(suggestion) }}
        />
      ) : (
        <p className="text-sm">
          <span className="font-medium">{chosen.name}</span>{' '}
          <button
            type="button"
            onClick={() => { setChosen(null) }}
            className="text-neutral-500 underline underline-offset-2"
          >
            changer
          </button>
        </p>
      )}
    </div>
  )
}
