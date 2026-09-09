'use client'

import { useState } from 'react'

import { FootballerTypeahead } from '@/ui/footballer-typeahead'
import type { FootballerSuggestion } from '@/shared/search'

/**
 * Provisional: the referential and the typeahead exist before the grid does, and
 * an input mounted nowhere is an input nobody can try. #7 replaces this page,
 * and the same component then feeds an essai instead of this line of text.
 *
 * It owns the selection state because a Server Component cannot hand a callback
 * to a client one.
 */
export function SearchPreview() {
  const [picked, setPicked] = useState<FootballerSuggestion | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <FootballerTypeahead label="Chercher un footballeur" onSelect={setPicked} />
      <p className="min-h-6 text-sm text-neutral-600">
        {picked ? `Sélectionné : ${picked.name}` : 'Deux lettres suffisent.'}
      </p>
    </div>
  )
}
