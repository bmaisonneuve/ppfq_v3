'use client'

import { useActionState } from 'react'

import { IDLE_CURATION_ACTION } from '@/shared/curation'
import type { CurationAction } from '@/shared/curation'

import { ActionStatus } from './action-status'

/**
 * Creating a club the catalogue does not have.
 *
 * Needed because the missing passage and the missing club are usually the same
 * hole: the source has no statement for the spell, so it has never named the
 * club either. Without this the repair stops one step short.
 *
 * The row carries no Wikidata id, which is the model's own marker for something
 * entered by hand — and means a later import that meets the real club creates
 * its own row rather than silently renaming this one under every footballer.
 */
export function CreateClubForm({ createClubAction }: { createClubAction: CurationAction }) {
  const [state, create, pending] = useActionState(createClubAction, IDLE_CURATION_ACTION)

  return (
    <form action={create} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs font-medium text-neutral-600">
        Nom français
        <input
          type="text"
          name="frName"
          required
          maxLength={120}
          placeholder="Olympique de Marseille"
          className="w-64 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-neutral-600">
        Nom anglais (facultatif)
        <input
          type="text"
          name="enName"
          maxLength={120}
          className="w-56 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {pending ? 'Création…' : 'Créer le club'}
      </button>
      <div className="w-full">
        <ActionStatus state={state} />
      </div>
    </form>
  )
}
