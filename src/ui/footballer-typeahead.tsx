'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
  placeholder = 'Zidane, Chicharito…',
  tone = 'form',
  onSelect,
  onHighlight,
}: Readonly<{
  label: string
  placeholder?: string
  /**
   * L'habillage, et rien d'autre : `form` au back-office, `game` sur l'écran
   * du jeu, où le champ est blanc dans le bandeau vert sombre et où la liste
   * s'ouvre **vers le haut** — le bandeau est collé au bas de la fenêtre, et
   * une liste vers le bas sortirait de l'écran.
   */
  tone?: 'form' | 'game'
  onSelect: (suggestion: FootballerSuggestion) => void
  /**
   * Ce que la touche Entrée validerait, et de quoi le valider soi-même.
   *
   * L'écran du jeu pose un bouton « Valider » **à côté** du champ, pas dedans :
   * il lui faut donc savoir de l'extérieur s'il y a quelque chose à valider, et
   * disposer du même geste que la touche Entrée — celui qui vide le champ et
   * referme la liste en même temps qu'il propose. Sans ce second argument, le
   * bouton laisserait derrière lui le texte de la proposition déjà envoyée.
   *
   * `submit` est stable : le parent peut la garder dans un état sans que sa
   * seule identité déclenche un rendu de plus.
   */
  onHighlight?: (suggestion: FootballerSuggestion | null, submit: () => void) => void
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
      // Reached only with a list open — the guard at the top of this handler.
      // Cancelling the event is what keeps the key: a close request belongs to
      // whatever encloses the input, and `stopPropagation` would not hold it
      // back — the browser watches the keydown being *cancelled*, not where it
      // travels. Without this, one press closes the list and everything around
      // it at once.
      event.preventDefault()
      setLastAnswer([])
    }
  }

  const open = suggestions.length > 0
  const activeId = open ? `${listId}-${highlighted}` : undefined
  const skin = SKINS[tone]

  // Ce que « Valider » validerait, remonté à qui a le bouton. Un effet et non
  // un appel pendant le rendu : prévenir le parent est un effet de bord, et
  // React interdit de le faire pendant qu'il calcule l'arbre.
  const choice = suggestions[highlighted] ?? null

  const pick = useRef<() => void>(noop)
  useEffect(() => {
    pick.current = () => {
      if (choice !== null) choose(choice)
    }
  })

  const submit = useCallback(() => {
    pick.current()
  }, [])

  useEffect(() => {
    onHighlight?.(choice, submit)
  }, [choice, onHighlight, submit])

  return (
    <div className="relative">
      <label htmlFor={inputId} className={skin.label}>
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
        placeholder={placeholder}
        className={skin.input}
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={skin.list}
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
                className={`${skin.option} ${
                  index === highlighted ? skin.highlighted : 'bg-white'
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

/**
 * Les deux habillages, côte à côte pour qu'ils restent comparables.
 *
 * Le comportement est au-dessus et il est le même dans les deux : ce tableau ne
 * contient que des classes, jamais une différence de logique. C'est ce qui
 * permet d'en ajouter un troisième sans relire le composant.
 */
const SKINS = {
  form: {
    label: 'block text-sm font-medium text-neutral-700',
    input:
      'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900',
    list: 'absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg',
    option: 'block w-full px-3 py-2 text-left text-base',
    highlighted: 'bg-neutral-100',
  },
  game: {
    label: 'sr-only',
    input:
      'rounded-row font-mono text-field text-ink placeholder:text-ink/45 caret-pitch w-full bg-white px-[14px] py-[13px] outline-none',
    list: 'rounded-row absolute bottom-full z-10 mb-2 max-h-[40dvh] w-full overflow-y-auto bg-white',
    option: 'font-display block w-full px-[14px] py-[10px] text-left text-[15px] font-bold',
    highlighted: 'bg-crest',
  },
} as const

const noop = (): void => undefined
