'use client'

import { useActionState } from 'react'
import type { ReactNode } from 'react'

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
    <li className="panel flex flex-col gap-3">
      <PassageFlags flags={passage.flags} />

      <div className="flex flex-wrap items-end gap-3">
        <form action={save} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="passageId" value={passage.id} />

          <ClubCrest clubId={passage.clubId} crestKey={passage.crestKey} />

          <div className="flex min-w-56 flex-col gap-1">
            <span className="field-label">Club</span>
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

          <label className="text-body flex items-center gap-2 pb-2">
            <input type="checkbox" name="isLoan" defaultChecked={passage.isLoan} />
            prêt
          </label>

          <IconSubmit
            label={saving ? 'Enregistrement…' : 'Enregistrer le passage'}
            pending={saving}
            className="btn-icon"
          >
            <CheckIcon />
          </IconSubmit>
        </form>

        <form action={remove}>
          <input type="hidden" name="passageId" value={passage.id} />
          <IconSubmit
            label={deleting ? 'Suppression…' : 'Supprimer le passage'}
            pending={deleting}
            className="btn-icon-danger"
          >
            <TrashIcon />
          </IconSubmit>
        </form>
      </div>

      <ActionStatus state={saveState} />
      <ActionStatus state={deleteState} />
    </li>
  )
}

/**
 * A submit button that is one icon wide.
 *
 * The two gestures of a passage row — save it, delete it — sat at the end of a
 * line already carrying a crest, a club picker, four number fields and a
 * checkbox. Spelled out, they were the two widest things on the line and they
 * pushed it onto a second row on any screen narrower than a desktop.
 *
 * What the icon cannot say, the label says: `aria-label` for a screen reader,
 * `title` for a pointer, and both of them carry the pending state too — so the
 * feedback that used to be "Enregistrement…" inside the button is still there,
 * for both kinds of reader.
 */
function IconSubmit({
  label,
  pending,
  className,
  children,
}: Readonly<{
  label: string
  pending: boolean
  className: string
  children: ReactNode
}>) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
    </button>
  )
}

/** Enregistrer. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4,10.5 8,14.5 16,6" />
    </svg>
  )
}

/** Supprimer. */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3.5" y1="5.5" x2="16.5" y2="5.5" />
      <path d="M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10" />
      <line x1="8.5" y1="8.5" x2="8.8" y2="14" />
      <line x1="11.5" y1="8.5" x2="11.2" y2="14" />
    </svg>
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
 * The player's side shows them too, since the grid became three cards and a
 * parcours with its clubs pictured. That was a game decision and not a
 * consequence of the back-office having the images — the note that used to
 * stand here said so while it was still open.
 */
function ClubCrest({
  clubId,
  crestKey,
}: Readonly<{ clubId: string; crestKey: string | null }>) {
  return (
    <a
      href={`/admin/clubs/${clubId}`}
      title="Ouvrir la fiche du club"
      className="rounded-icon border-line bg-white flex size-10 shrink-0 items-center justify-center self-center border"
    >
      {crestKey === null ? (
        <span className="text-crest-ink font-display text-[12px] font-bold">?</span>
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
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <input
        type="number"
        name={name}
        required={required}
        min={EARLIEST_FORM_YEAR}
        max={LATEST_FORM_YEAR}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        className="field w-24"
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
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <input
        type="number"
        name={name}
        min={0}
        max={MAX_COUNT}
        defaultValue={defaultValue ?? ''}
        className="field w-20"
      />
    </label>
  )
}
