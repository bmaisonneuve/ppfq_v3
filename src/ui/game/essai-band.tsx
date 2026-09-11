'use client'

import { useCallback, useState } from 'react'

import { MAX_TRIES, triesLeft } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'
import type { FootballerSuggestion } from '@/shared/search'
import { FootballerTypeahead } from '@/ui/footballer-typeahead'

/**
 * Le bandeau de l'écran de jeu : ce qui reste, ce qu'on propose, et le tour
 * qu'on passe.
 *
 * Les deux boutons ne font pas la même chose et ne se ressemblent pas non plus,
 * ce qui est le point : « Valider » est plein et large, « PASSER −1 » est un
 * contour étroit qui annonce son prix dans son libellé. Passer consomme un
 * essai exactement comme une erreur (CONTEXT.md), et c'est ce `−1` qui
 * l'empêche de se lire comme un coup de pouce gratuit.
 */
export function EssaiBand({
  play,
  pending,
  onSubmit,
}: Readonly<{
  play: EnigmaPlay
  pending: boolean
  onSubmit: (footballerId: string | null) => void
}>) {
  /**
   * La suggestion surlignée dans la liste, et le geste qui la propose.
   *
   * Le bouton « Valider » est hors du champ, donc il ne peut ni savoir ce que
   * la liste montre ni la refermer : les deux lui viennent du composant de
   * recherche. Cliquer « Valider » et appuyer sur Entrée exécutent alors
   * exactement le même code.
   */
  const [choice, setChoice] = useState<Choice | null>(null)

  const onHighlight = useCallback(
    (suggestion: FootballerSuggestion | null, submit: () => void) => {
      setChoice(suggestion === null ? null : { suggestion, submit })
    },
    [],
  )

  const left = triesLeft(play)

  return (
    <>
      <div className="flex items-center justify-between gap-[10px]">
        <span className="font-mono text-state text-ink">
          {left} essai{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''}
        </span>
        <Tokens spent={play.triesUsed} />
      </div>

      <FootballerTypeahead
        label="Proposez un footballeur"
        placeholder="Tapez un nom de footballeur…"
        tone="game"
        onHighlight={onHighlight}
        // Pas désactivé par `pending`, contrairement au bouton : choisir une
        // suggestion est un geste délibéré à chaque fois, et deux choix sont
        // deux essais.
        onSelect={(suggestion) => {
          onSubmit(suggestion.footballerId)
        }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={choice === null || pending}
          onClick={() => {
            choice?.submit()
          }}
          className="bg-ink rounded-row font-display text-action flex-1 cursor-pointer px-4 py-[15px] text-white disabled:opacity-50"
        >
          {pending ? 'Envoi…' : 'Valider'}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onSubmit(null)
          }}
          className="rounded-row border-ink font-mono text-pass text-ink cursor-pointer border-[1.5px] px-4 py-[15px] disabled:opacity-50"
        >
          PASSER −1
        </button>
      </div>
    </>
  )
}

type Choice = { suggestion: FootballerSuggestion; submit: () => void }

/** Les six jetons : pleins ce qui est dépensé, cerclés ce qui reste. */
function Tokens({ spent }: Readonly<{ spent: number }>) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: MAX_TRIES }, (_, index) => (
        <span
          key={index}
          className={`size-[12px] shrink-0 rounded-full border-2 ${
            index < spent ? 'bg-ink border-ink' : 'border-ink/35 bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}
