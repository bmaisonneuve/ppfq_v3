'use client'

import { useRouter } from 'next/navigation'

import { FootballerTypeahead } from '@/ui/footballer-typeahead'

/**
 * Finding the footballer to curate.
 *
 * The same typeahead the player uses, over the same referential — which is the
 * point: the admin searches the 382 703 footballers, not the handful already
 * curated. "Curé" is not a status and there is no separate list to pick from;
 * opening a dossier on someone with no passages is how curation starts.
 */
export function AdminFootballerSearch() {
  const router = useRouter()

  return (
    <FootballerTypeahead
      label="Chercher un footballeur"
      onSelect={(suggestion) => {
        router.push(`/admin/footballers/${suggestion.footballerId}`)
      }}
    />
  )
}
