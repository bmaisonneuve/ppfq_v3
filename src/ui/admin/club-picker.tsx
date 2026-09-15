'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

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
 *
 * « Changer » is undoable, and it has to be: it empties the field, so a mistaken
 * click used to leave the passage with no club and no way back — the name was
 * gone from the screen, and only a reload brought it back, taking whatever else
 * was half-typed in the row with it. What it removes is therefore kept aside
 * until the choice is made again, and offered back by a cross next to the
 * search box and by Escape.
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
  /**
   * Ce que « changer » a mis de côté — donc aussi ce qui distingue une recherche
   * ouverte par erreur d'un champ qui n'a jamais rien contenu. `null` dans le
   * second cas : le formulaire d'ajout d'un passage n'a rien à annuler, il n'a
   * pas de croix et la touche Échap n'y répond pas.
   */
  const [undone, setUndone] = useState<ClubOption | null>(null)
  const [query, setQuery] = useState('')
  const [lastAnswer, setLastAnswer] = useState<ClubOption[]>([])
  const inputId = useId()
  const searchBox = useRef<HTMLInputElement>(null)

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

  // Le champ prend le curseur quand c'est « changer » qui l'a ouvert : on vient
  // de cliquer pour taper un nom, et surtout Échap n'atteint que ce qui a le
  // focus — le bouton qui l'a fait apparaître, lui, n'existe plus.
  useEffect(() => {
    if (undone !== null) searchBox.current?.focus()
  }, [undone])

  function choose(club: ClubOption): void {
    setSelected(club)
    // La nouvelle réponse remplace l'ancienne : il n'y a plus de modification en
    // cours, donc plus rien à annuler.
    setUndone(null)
    setQuery('')
    setLastAnswer([])
  }

  /** Vider le champ pour en chercher un autre, sans perdre celui qui y était. */
  function change(): void {
    setUndone(selected)
    setSelected(null)
  }

  /** Remettre le club que « changer » avait retiré. */
  function cancel(): void {
    if (undone === null) return
    setSelected(undone)
    setUndone(null)
    setQuery('')
    setLastAnswer([])
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || undone === null) return
    // Annulé plutôt que laissé passer : ailleurs sur le site, Échap ferme ce qui
    // entoure le champ, et fermer la ligne de passage en laissant son club vide
    // serait l'inverse de ce que la touche vient de promettre.
    event.preventDefault()
    cancel()
  }

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={fieldName} value={selected?.id ?? ''} />

      {selected === null ? null : (
        /* Le nom sur sa ligne, « changer » sous lui : à la suite, la reprise
           passait pour un morceau du nom du club, et le bloc dépassait la
           hauteur d'une ligne dès que le nom était long — ce qui décalait le
           blason à côté. */
        <div className="flex flex-col items-start">
          <span className="text-body font-bold leading-tight">{selected.frName}</span>
          <button type="button" onClick={change} className="link text-note text-muted">
            changer
          </button>
        </div>
      )}

      {selected === null ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            Chercher un club
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              ref={searchBox}
              type="text"
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
              onKeyDown={onKeyDown}
              placeholder="Chercher un club…"
              autoComplete="off"
              className="field min-w-0 flex-1"
            />
            {undone === null ? null : (
              <button
                type="button"
                onClick={cancel}
                onKeyDown={onKeyDown}
                aria-label={`Annuler et garder ${undone.frName} (Échap)`}
                title={`Annuler et garder ${undone.frName} (Échap)`}
                className="btn-icon-quiet"
              >
                <CrossIcon />
              </button>
            )}
          </div>
          {options.length === 0 ? null : (
            <ul className="rounded-field border-line bg-white divide-line text-body divide-y overflow-hidden border">
              {options.map((club) => (
                <li key={club.id}>
                  <button
                    type="button"
                    onClick={() => { choose(club) }}
                    onKeyDown={onKeyDown}
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

/** Annuler la modification. */
function CrossIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <line x1="5.5" y1="5.5" x2="14.5" y2="14.5" />
      <line x1="14.5" y1="5.5" x2="5.5" y2="14.5" />
    </svg>
  )
}
