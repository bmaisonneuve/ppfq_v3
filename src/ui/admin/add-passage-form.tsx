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
 *
 * Its line copies the geometry of a passage line above it — the empty slot where
 * a crest will be, the same club column, the same field widths, the action at
 * the right end. Not for symmetry: it is the last line of the list, read as one
 * more row of the same table, and a column that starts 52 px to the left of the
 * eight above it is read as a different field.
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
        {/* La place du blason. Vide, parce que le club n'est pas encore choisi
            et qu'un blason appartient à un club — mais tenue, sinon la colonne
            des clubs de cette ligne commence avant celle des lignes du dessus. */}
        <div
          aria-hidden
          className="rounded-icon border-line size-10 shrink-0 self-center border border-dashed"
        />

        <div className="flex min-w-72 flex-col gap-1">
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

        {/* Au bout de la ligne, comme les deux icônes d'un passage : c'est le
            même bord, et c'est là que le regard va chercher l'action. */}
        <button
          type="submit"
          disabled={pending}
          className="btn ml-auto"
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
