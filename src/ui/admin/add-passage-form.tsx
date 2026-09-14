'use client'

import { useActionState } from 'react'

import {
  EARLIEST_FORM_YEAR,
  IDLE_CURATION_ACTION,
  LATEST_FORM_YEAR,
  MAX_COUNT,
} from '@/shared/curation'
import type { ClubSearchAction } from '@/shared/club'
import type { CurationAction } from '@/shared/curation'

import { ActionStatus } from './action-status'
import { ClubPicker } from './club-picker'

/**
 * Adding the passage the source does not have.
 *
 * The reason the editor is not read-only. Cantona's seven passages are all
 * complete and his Marseille years are simply absent from Wikidata, which
 * leaves three loans attached to nothing and a 1988-1991 hole no query can see.
 * Typing the missing club in is the only repair there is — and at least 21,5 %
 * of otherwise complete careers have a hole like it.
 */
export function AddPassageForm({
  footballerId,
  addPassageAction,
  searchClubsAction,
}: Readonly<{
  footballerId: string
  addPassageAction: CurationAction
  searchClubsAction: ClubSearchAction
}>) {
  const [state, add, pending] = useActionState(addPassageAction, IDLE_CURATION_ACTION)

  return (
    <form action={add} className="panel border-line flex flex-col gap-3 border border-dashed">
      <input type="hidden" name="footballerId" value={footballerId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-1">
          <span className="field-label">Club</span>
          <ClubPicker searchClubsAction={searchClubsAction} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="field-label">Début</span>
          <input
            type="number"
            name="startYear"
            required
            min={EARLIEST_FORM_YEAR}
            max={LATEST_FORM_YEAR}
            className="field w-24"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Fin</span>
          <input
            type="number"
            name="endYear"
            min={EARLIEST_FORM_YEAR}
            max={LATEST_FORM_YEAR}
            placeholder="en cours"
            className="field w-24"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Matchs</span>
          <input type="number" name="matches" min={0} max={MAX_COUNT} className="field w-20" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Buts</span>
          <input type="number" name="goals" min={0} max={MAX_COUNT} className="field w-20" />
        </label>

        <label className="text-body flex items-center gap-2 pb-2">
          <input type="checkbox" name="isLoan" />
          prêt
        </label>

        <button
          type="submit"
          disabled={pending}
          className="btn"
        >
          {pending ? 'Ajout…' : 'Ajouter le passage'}
        </button>
      </div>

      <p className="hint">
        L’ordre découle des années : un passage se place tout seul, et se déplace en
        corrigeant une année.
      </p>

      <ActionStatus state={state} />
    </form>
  )
}
