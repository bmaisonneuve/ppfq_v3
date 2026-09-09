'use client'

import { useActionState } from 'react'

import { IDLE_CURATION_ACTION } from '@/shared/curation'
import type { CurationAction } from '@/shared/curation'

import { ActionStatus } from './action-status'

/**
 * Re-running the Wikidata import for this footballer, from the screen.
 *
 * The service is called in line, not queued: a footballer is two SPARQL queries
 * waiting on I/O. The action then calls `refresh()`, so the parcours below
 * re-renders from the catalogue with no manual reload — which matters here more
 * than anywhere, because what the import produced is exactly what the admin has
 * come to look at.
 *
 * The warning is not decoration. The import **replaces** the parcours
 * (ADR-0005): a reserve team removed by hand comes back, because nothing in the
 * source says it is one.
 */
export function ReimportButton({
  qid,
  reimportAction,
}: {
  /** Null for a footballer entered by hand: there is nothing to re-import. */
  qid: string | null
  reimportAction: CurationAction
}) {
  const [state, reimport, pending] = useActionState(reimportAction, IDLE_CURATION_ACTION)

  if (qid === null) {
    return (
      <p className="text-xs text-neutral-500">
        Footballeur sans identifiant Wikidata : pas d’import possible.
      </p>
    )
  }

  return (
    <form action={reimport} className="flex flex-col gap-1">
      <input type="hidden" name="qid" value={qid} />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {pending ? 'Import en cours…' : `Relancer l’import (${qid})`}
      </button>
      <p className="text-xs text-neutral-500">
        L’import remplace le parcours entier : une réserve retirée à la main revient.
      </p>
      <ActionStatus state={state} />
    </form>
  )
}
