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
      <label className="flex flex-col text-xs font-medium text-neutral-600">
        Nom français
        <input
          type="text"
          name="frName"
          required
          maxLength={120}
          defaultValue={frName}
          className="w-72 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-neutral-600">
        Nom anglais (facultatif)
        <input
          type="text"
          name="enName"
          maxLength={120}
          defaultValue={enName ?? ''}
          className="w-64 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <div className="w-full">
        <ActionStatus state={state} />
      </div>
    </form>
  )
}
