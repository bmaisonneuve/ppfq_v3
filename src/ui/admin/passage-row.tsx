'use client'

import { useActionState } from 'react'

import {
  EARLIEST_FORM_YEAR,
  IDLE_CURATION_ACTION,
  LATEST_FORM_YEAR,
  MAX_COUNT,
} from '@/shared/curation'
import { crestUrl } from '@/shared/club'
import type { ClubOption, ClubSearchAction } from '@/shared/club'
import type { CurationAction, FlaggedPassage } from '@/shared/curation'

import { ActionStatus } from './action-status'
import { ClubPicker } from './club-picker'
import { PassageFlags } from './passage-flags'

/**
 * One passage of the parcours, editable in place.
 *
 * There is no handle to drag: `player_clubs` has no ordering column, so the
 * order is a consequence of `(start_year, end_year, id)` and a drag would
 * promise something the model cannot keep — the row would snap back on reload.
 * Correcting an order means correcting a year, and the year is a field here.
 *
 * Saving and deleting are two sibling forms rather than one form with two
 * buttons: a delete that shares a form with the edit fields would carry them,
 * and a half-typed year has no business travelling with a deletion.
 */
export function PassageRow({
  passage,
  updateAction,
  deleteAction,
  searchClubsAction,
}: Readonly<{
  passage: FlaggedPassage
  updateAction: CurationAction
  deleteAction: CurationAction
  searchClubsAction: ClubSearchAction
}>) {
  const [saveState, save, saving] = useActionState(updateAction, IDLE_CURATION_ACTION)
  const [deleteState, remove, deleting] = useActionState(deleteAction, IDLE_CURATION_ACTION)

  // The club as the picker shows it, straight from the dossier.
  const club: ClubOption = {
    id: passage.clubId,
    frName: passage.clubName,
    enName: passage.clubEnName,
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-3">
      <PassageFlags flags={passage.flags} />

      <div className="flex flex-wrap items-end gap-3">
        <form action={save} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="passageId" value={passage.id} />

          <ClubCrest clubId={passage.clubId} crestKey={passage.clubCrestKey} />

          <div className="min-w-56">
            <span className="block text-xs font-medium text-neutral-600">Club</span>
            <ClubPicker searchClubsAction={searchClubsAction} defaultClub={club} />
          </div>

          <YearField
            label="Début"
            name="startYear"
            defaultValue={passage.startYear}
            required
          />
          <YearField
            label="Fin"
            name="endYear"
            defaultValue={passage.endYear}
            // Empty means the career is still in progress, which is a fact and
            // not a gap: the duration then keeps growing at render time.
            placeholder="en cours"
          />
          <CountField label="Matchs" name="matches" defaultValue={passage.matches} />
          <CountField label="Buts" name="goals" defaultValue={passage.goals} />

          <label className="flex items-center gap-1 pb-1 text-sm">
            <input type="checkbox" name="isLoan" defaultChecked={passage.isLoan} />
            prêt
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <form action={remove}>
          <input type="hidden" name="passageId" value={passage.id} />
          <button
            type="submit"
            disabled={deleting}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </form>
      </div>

      <ActionStatus state={saveState} />
      <ActionStatus state={deleteState} />
    </li>
  )
}

/**
 * The club's crest, in the parcours, linking to its fiche.
 *
 * Here rather than only on the fiche because this is the screen where the
 * clubs of a footballer are in front of the admin at once: a 1894 team
 * photograph among eight crests is obvious in a row and invisible anywhere
 * else. The gap is a link too — a club with no crest is the other thing worth
 * noticing, and one click is the repair.
 *
 * Deliberately not on the player's side. The grid is prerendered and cached
 * whole (ADR-0008); putting images into it is a game decision, not a
 * consequence of the back-office having them.
 */
function ClubCrest({
  clubId,
  crestKey,
}: Readonly<{ clubId: string; crestKey: string | null }>) {
  return (
    <a
      href={`/admin/clubs/${clubId}`}
      title="Ouvrir la fiche du club"
      className="flex size-10 shrink-0 items-center justify-center self-center rounded border border-neutral-200 bg-white"
    >
      {crestKey === null ? (
        <span className="text-[10px] text-neutral-400">?</span>
      ) : (
        // A plain `<img>`: the bytes are an already-rendered thumbnail behind a
        // content-addressed, immutable URL, on an admin screen. See
        // `club-crest-form.tsx`.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crestUrl(crestKey)} alt="" className="max-h-8 max-w-8 object-contain" />
      )}
    </a>
  )
}

function YearField({
  label,
  name,
  defaultValue,
  required,
  placeholder,
}: Readonly<{
  label: string
  name: string
  defaultValue: number | null
  required?: boolean
  placeholder?: string
}>) {
  return (
    <label className="flex flex-col text-xs font-medium text-neutral-600">
      {label}
      <input
        type="number"
        name={name}
        required={required}
        min={EARLIEST_FORM_YEAR}
        max={LATEST_FORM_YEAR}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
      />
    </label>
  )
}

/**
 * League matches or league goals — championship only, which is what the source
 * counts and what the game says out loud at hints 4 and 5.
 *
 * Left empty rather than zeroed while unknown: zero is a different, real fact.
 */
function CountField({
  label,
  name,
  defaultValue,
}: Readonly<{
  label: string
  name: string
  defaultValue: number | null
}>) {
  return (
    <label className="flex flex-col text-xs font-medium text-neutral-600">
      {label}
      <input
        type="number"
        name={name}
        min={0}
        max={MAX_COUNT}
        defaultValue={defaultValue ?? ''}
        className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
      />
    </label>
  )
}
