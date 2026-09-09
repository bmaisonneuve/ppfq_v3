'use client'

import { useActionState } from 'react'

import type { Nationality } from '@/shared/career'
import { IDLE_CURATION_ACTION } from '@/shared/curation'
import type { CurationAction } from '@/shared/curation'

import { ActionStatus } from './action-status'

/**
 * The sporting nationality: one, even for a dual national.
 *
 * A single select and no multi-choice, because hint 3 falls in the middle of a
 * game — a wrong flag is a false enigma, while a missing one only makes the
 * footballer unschedulable. Which is also why "aucune" stays available: the
 * import never unsets a nationality, so the admin is the only one who can take
 * back one that was typed wrong.
 *
 * The list is what the imports have created. A country with none of the three
 * ISO codes never enters the table, and the footballer then stays without one.
 */
export function NationalityForm({
  footballerId,
  nationality,
  nationalities,
  setNationalityAction,
}: {
  footballerId: string
  nationality: Nationality | null
  nationalities: readonly Nationality[]
  setNationalityAction: CurationAction
}) {
  const [state, submit, pending] = useActionState(setNationalityAction, IDLE_CURATION_ACTION)

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="footballerId" value={footballerId} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Nationalité sportive
          <select
            name="nationalityId"
            defaultValue={nationality?.id ?? ''}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">— aucune —</option>
            {nationalities.map((option) => (
              <option key={option.id} value={option.id}>
                {option.frName} ({option.code})
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {nationalities.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Aucune nationalité en base pour l’instant : elles sont créées par les imports.
        </p>
      ) : null}

      <ActionStatus state={state} />
    </form>
  )
}
