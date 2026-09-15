'use client'

import Link from 'next/link'
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
 *
 * Once chosen, the name is a door to his dossier: programming a day is the
 * moment one wants to check a career before committing it. It opens in another
 * tab, and that is not a detail — the form holds up to three choices and a
 * theme that no draft survives, so following the link in place would throw away
 * the work of the person who clicked it.
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
    // `min-w-0` : la colonne fait `1fr`, et un nom de footballeur à rallonge
    // l'élargirait sinon au lieu de passer à la ligne — les trois colonnes
    // cesseraient d'avoir la même largeur. La largeur elle-même est décidée
    // par la grille du formulaire, pas ici.
    <div className="flex min-w-0 flex-col gap-1">
      <span className="field-label">
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
        <p className="text-body">
          <Link
            href={`/admin/footballers/${chosen.footballerId}`}
            target="_blank"
            rel="noreferrer"
            className="link font-bold"
          >
            {chosen.name}
          </Link>{' '}
          <button
            type="button"
            onClick={() => { setChosen(null) }}
            className="link text-muted"
          >
            changer
          </button>
        </p>
      )}
    </div>
  )
}
