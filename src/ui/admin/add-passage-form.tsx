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
    <form action={add} className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-300 p-3">
      <input type="hidden" name="footballerId" value={footballerId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <span className="block text-xs font-medium text-neutral-600">Club</span>
          <ClubPicker searchClubsAction={searchClubsAction} />
        </div>

        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Début
          <input
            type="number"
            name="startYear"
            required
            min={EARLIEST_FORM_YEAR}
            max={LATEST_FORM_YEAR}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Fin
          <input
            type="number"
            name="endYear"
            min={EARLIEST_FORM_YEAR}
            max={LATEST_FORM_YEAR}
            placeholder="en cours"
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Matchs
          <input
            type="number"
            name="matches"
            min={0}
            max={MAX_COUNT}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Buts
          <input
            type="number"
            name="goals"
            min={0}
            max={MAX_COUNT}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <label className="flex items-center gap-1 pb-1 text-sm">
          <input type="checkbox" name="isLoan" />
          prêt
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Ajout…' : 'Ajouter le passage'}
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        L’ordre découle des années : un passage se place tout seul, et se déplace en
        corrigeant une année.
      </p>

      <ActionStatus state={state} />
    </form>
  )
}
