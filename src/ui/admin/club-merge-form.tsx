'use client'

import { useActionState } from 'react'

import { IDLE_CLUB_ACTION } from '@/shared/club'
import type { ClubAction, ClubSearchAction } from '@/shared/club'

import { ActionStatus } from './action-status'
import { ClubPicker } from './club-picker'

/**
 * Merging a duplicate into the club being looked at.
 *
 * The duplicate is created on purpose and the catalogue says so: a club typed
 * in by hand carries no Wikidata id, so the day the import meets the real club
 * it inserts a **second** row rather than adopting the first — a silent
 * adoption would rename a club under every footballer at once. This form is the
 * other half of that decision.
 *
 * The club on screen is the one that **survives**, and the picker chooses the
 * one that disappears. That direction is fixed rather than offered: the admin
 * arrived on this fiche, this is the row he has been reading, and a form where
 * either side might vanish is a form nobody trusts.
 *
 * The picker is the passage picker, reused: a merge and a passage both point at
 * a club, and a second search would be a second way to be wrong.
 */
export function ClubMergeForm({
  keepId,
  keepName,
  mergeAction,
  searchClubsAction,
}: Readonly<{
  keepId: string
  keepName: string
  mergeAction: ClubAction
  searchClubsAction: ClubSearchAction
}>) {
  const [state, merge, pending] = useActionState(mergeAction, IDLE_CLUB_ACTION)

  return (
    <form action={merge} className="flex flex-col gap-2">
      <input type="hidden" name="keepId" value={keepId} />
      <p className="text-sm text-neutral-600">
        Le doublon disparaît, ses passages sont repris par{' '}
        <span className="font-medium">{keepName}</span>, et celui-ci adopte ce qui lui
        manque — identifiant Wikidata, nom anglais, blason. Rien de déjà renseigné n’est
        écrasé.
      </p>
      <div className="max-w-sm">
        {/* Named `mergedId`, so the two ends of a merge cannot be confused in
            the form data: `keepId` is the fiche, `mergedId` is what vanishes. */}
        <ClubPicker searchClubsAction={searchClubsAction} fieldName="mergedId" />
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          {pending ? 'Fusion…' : 'Fusionner dans ce club'}
        </button>
      </div>
      <ActionStatus state={state} />
    </form>
  )
}
