'use client'

import { useActionState } from 'react'

import { IDLE_CLUB_ACTION } from '@/shared/club'
import type { ClubAction } from '@/shared/club'

import { ActionStatus } from './action-status'

/**
 * The two names of a club, editable.
 *
 * The case that makes this necessary: a club the source names in no language is
 * inserted under its Wikidata id, so a parcours shows `Q123456`. The code that
 * does it calls that "visibly wrong and trivially fixable" — this form is what
 * makes the second half true.
 *
 * The French name is what the game displays and is required; the English one
 * may be emptied, because "we do not know it" is a fact the model stores as
 * null. It is not cosmetic either: the reserve-team heuristic was measured on
 * English labels, and a French name can lose the marker the English one carries.
 */
export function ClubNamesForm({
  clubId,
  frName,
  enName,
  renameAction,
}: Readonly<{
  clubId: string
  frName: string
  enName: string | null
  renameAction: ClubAction
}>) {
  const [state, rename, pending] = useActionState(renameAction, IDLE_CLUB_ACTION)

  return (
    <form action={rename} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="clubId" value={clubId} />
      <label className="flex flex-col gap-1">
        <span className="field-label">Nom français</span>
        <input
          type="text"
          name="frName"
          required
          maxLength={120}
          defaultValue={frName}
          className="field w-72"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Nom anglais (facultatif)</span>
        <input
          type="text"
          name="enName"
          maxLength={120}
          defaultValue={enName ?? ''}
          className="field w-64"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn"
      >
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <div className="w-full">
        <ActionStatus state={state} />
      </div>
    </form>
  )
}
