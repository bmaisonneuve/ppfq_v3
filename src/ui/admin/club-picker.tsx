'use client'

import { useEffect, useId, useState } from 'react'

import { MIN_CLUB_QUERY_LENGTH, type ClubOption, type ClubSearchAction } from '@/shared/club'
import { SEARCH_DEBOUNCE_MS } from '@/shared/search'

/**
 * Picking the club of a passage.
 *
 * A search rather than a `<select>`: the catalogue grows a club every time an
 * import meets a new one, and a list of several thousand options in a page that
 * already carries one form per passage is not a list anyone reads.
 *
 * It is not the player typeahead and does not need to be — one admin, no cache
 * to warm, no notoriety to rank by. What it does share is the two-character
 * floor and the debounce, held on the server side too.
 *
 * The selected id travels in a hidden field, so the surrounding form submits
 * with or without JavaScript once a club is chosen. The field is named by the
 * caller: a passage form sends a `clubId`, and the merge form sends the club
 * that is about to disappear under a name that says so.
 */
export function ClubPicker({
  searchClubsAction,
  defaultClub,
  fieldName = 'clubId',
}: Readonly<{
  searchClubsAction: ClubSearchAction
  /** The club a passage already points at. Absent when adding one. */
  defaultClub?: ClubOption | null
  fieldName?: string
}>) {
  const [selected, setSelected] = useState<ClubOption | null>(defaultClub ?? null)
  const [query, setQuery] = useState('')
  const [lastAnswer, setLastAnswer] = useState<ClubOption[]>([])
  const inputId = useId()

  const searchable = query.trim().length >= MIN_CLUB_QUERY_LENGTH

  // Derived rather than cleared, like the player typeahead: deleting back down
  // to one character hides the list without a round trip and without a second
  // source of truth.
  const options = searchable ? lastAnswer : []

  useEffect(() => {
    if (!searchable) return

    let current = true
    const timer = setTimeout(() => {
      void searchClubsAction(query).then((found) => {
        // A slower answer to an older query must not replace a newer list.
        if (current) setLastAnswer(found)
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchable, searchClubsAction])

  function choose(club: ClubOption): void {
    setSelected(club)
    setQuery('')
    setLastAnswer([])
  }

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={fieldName} value={selected?.id ?? ''} />

      {selected === null ? null : (
        <p className="text-body">
          <span className="font-bold">{selected.frName}</span>{' '}
          <button
            type="button"
            onClick={() => { setSelected(null) }}
            className="link text-muted"
          >
            changer
          </button>
        </p>
      )}

      {selected === null ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            Chercher un club
          </label>
          <input
            id={inputId}
            type="text"
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
            placeholder="Chercher un club…"
            autoComplete="off"
            className="field"
          />
          {options.length === 0 ? null : (
            <ul className="rounded-field border-line bg-white divide-line text-body divide-y overflow-hidden border">
              {options.map((club) => (
                <li key={club.id}>
                  <button
                    type="button"
                    onClick={() => { choose(club) }}
                    className="hover:bg-crest block w-full cursor-pointer px-3 py-2 text-left"
                  >
                    {club.frName}
                    {club.enName === null || club.enName === club.frName ? null : (
                      <span className="text-muted"> · {club.enName}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}
