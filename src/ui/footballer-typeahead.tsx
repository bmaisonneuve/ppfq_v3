'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import {
  MAX_QUERY_LENGTH,
  MIN_SEARCH_LENGTH,
  SEARCH_DEBOUNCE_MS,
  normalizeSearchTerm,
} from '@/shared/search'
import type { FootballerSuggestion, SearchResponse } from '@/shared/search'

/**
 * The only input in the game: the player types a few letters and picks a
 * footballer from the list. An essai is therefore always an existing
 * footballer, and never loses to a typo (specs §3).
 *
 * Two behaviours here are load levers rather than comfort, and both are held on
 * the server too: nothing is requested below two characters, and keystrokes are
 * debounced by 250 ms. The typeahead multiplies request volume by ~3.5 and is
 * the most-hit endpoint of the site (docs/stack-technique.md §10).
 *
 * It knows nothing about enigmas or essais: it hands a `footballerId` to its
 * caller. Submitting one as a guess is #9's business.
 */
export function FootballerTypeahead({
  label,
  onSelect,
}: Readonly<{
  label: string
  onSelect: (suggestion: FootballerSuggestion) => void
}>) {
  const [query, setQuery] = useState('')
  const [lastAnswer, setLastAnswer] = useState<FootballerSuggestion[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const inputId = useId()
  const listId = useId()

  // The same normalisation the server applies, so `a'` counts as one character
  // here too and never becomes a request.
  const searchable = normalizeSearchTerm(query).length >= MIN_SEARCH_LENGTH

  // Derived rather than cleared: deleting back down to one character hides the
  // list without a round trip and without a second source of truth. What was
  // last answered stays until an answer replaces it, which is what keeps the
  // list from blinking under the cursor during the debounce.
  const suggestions = searchable ? lastAnswer : []

  // The request generation. A response that arrives after a later keystroke is
  // dropped: `fetch` resolution order is not request order, and a stale list
  // under a fresh query is how a player clicks the wrong footballer.
  const generation = useRef(0)

  useEffect(() => {
    if (!searchable) return

    const controller = new AbortController()
    const mine = ++generation.current

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/footballers/search?q=${encodeURIComponent(query)}`,
            { signal: controller.signal },
          )
          if (!response.ok) return

          const body = (await response.json()) as SearchResponse
          if (mine !== generation.current) return

          setLastAnswer(body.suggestions)
          setHighlighted(0)
        } catch {
          // Aborted, offline, or a malformed answer: keep what is on screen
          // rather than blanking the list under the player's cursor.
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchable])

  function choose(suggestion: FootballerSuggestion): void {
    // Emptying the query is what closes the list: `suggestions` is derived.
    setQuery('')
    setLastAnswer([])
    setHighlighted(0)
    onSelect(suggestion)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (suggestions.length === 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => {
        const next = current + step
        return (next + suggestions.length) % suggestions.length
      })
      return
    }

    if (event.key === 'Enter') {
      const suggestion = suggestions[highlighted]
      if (!suggestion) return
      // Enter picks from the list; it never submits raw text.
      event.preventDefault()
      choose(suggestion)
      return
    }

    if (event.key === 'Escape') {
      setLastAnswer([])
    }
  }

  const open = suggestions.length > 0
  const activeId = open ? `${listId}-${highlighted}` : undefined

  return (
    <div className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        maxLength={MAX_QUERY_LENGTH}
        value={query}
        onChange={(event) => { setQuery(event.target.value) }}
        onKeyDown={onKeyDown}
        placeholder="Zidane, Chicharito…"
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.footballerId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
            >
              <button
                type="button"
                // The list is built from a fresh answer on every keystroke, so
                // the pointer must not wait for a re-render to agree with it.
                onMouseEnter={() => { setHighlighted(index) }}
                onClick={() => { choose(suggestion) }}
                className={`block w-full px-3 py-2 text-left text-base ${
                  index === highlighted ? 'bg-neutral-100' : 'bg-white'
                }`}
              >
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
