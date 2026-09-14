'use client'

import { useEffect, useId, useState } from 'react'

import { MIN_CLUB_QUERY_LENGTH } from '@/shared/club'
import type { ClubOption, ClubSearchAction } from '@/shared/club'
import { SEARCH_DEBOUNCE_MS } from '@/shared/search'

/**
 * Finding the club to curate.
 *
 * The same search the passage picker uses, over the same catalogue — but the
 * results are links rather than a selection, because here the club *is* the
 * destination. It is deliberately not a browsable table: the day the catalogue
 * has four thousand clubs, a list of them is not something anyone reads, and
 * the admin always arrives knowing which club he is looking for.
 *
 * Both names are shown, and that is not decoration: a duplicate pair is usually
 * the same club under a French name typed by hand and an English one the import
 * brought, and seeing the two side by side is how the admin spots it.
 */
export function ClubSearch({
  searchClubsAction,
}: Readonly<{ searchClubsAction: ClubSearchAction }>) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ClubOption[]>([])
  const inputId = useId()

  const searchable = query.trim().length >= MIN_CLUB_QUERY_LENGTH
  const options = searchable ? found : []

  useEffect(() => {
    if (!searchable) return

    let current = true
    const timer = setTimeout(() => {
      void searchClubsAction(query).then((clubs) => {
        // A slower answer to an older query must not replace a newer list.
        if (current) setFound(clubs)
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchable, searchClubsAction])

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="field-label">
        Chercher un club
      </label>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(event) => { setQuery(event.target.value) }}
        placeholder="Manchester United, Olympique de Marseille…"
        autoComplete="off"
        className="field"
      />
      {searchable && options.length === 0 ? (
        <p className="text-body text-muted">Aucun club de ce nom.</p>
      ) : null}
      {options.length === 0 ? null : (
        <ul className="divide-line rounded-field border-line bg-white divide-y overflow-hidden border">
          {options.map((club) => (
            <li key={club.id}>
              <a
                href={`/admin/clubs/${club.id}`}
                className="text-body hover:bg-crest block px-3 py-2"
              >
                {club.frName}
                {club.enName === null || club.enName === club.frName ? null : (
                  <span className="text-muted"> · {club.enName}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
