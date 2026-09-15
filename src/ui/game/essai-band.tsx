'use client'

import { useCallback, useState } from 'react'
import type { AnimationEvent } from 'react'

import { MAX_TRIES, triesLeft } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'
import type { FootballerSuggestion } from '@/shared/search'
import { FootballerTypeahead } from '@/ui/footballer-typeahead'

import { useDesktop } from './use-desktop'
import type { Verdict } from './verdict'

/**
 * Le bandeau de l'écran de jeu : ce qui reste, ce qu'on propose, et le tour
 * qu'on passe.
 *
 * Les deux boutons ne font pas la même chose et ne se ressemblent pas non plus,
 * ce qui est le point : « Valider » est plein et large, « PASSER −1 » est un
 * contour étroit qui annonce son prix dans son libellé. Passer consomme un
 * essai exactement comme une erreur (CONTEXT.md), et c'est ce `−1` qui
 * l'empêche de se lire comme un coup de pouce gratuit.
 *
 * ## Deux arrangements, un seul champ
 *
 * Le téléphone empile le champ puis la rangée des deux boutons ; l'ordinateur
 * (`1c`) range « Valider » **dans** le champ et pose « PASSER −1 » sur une
 * ligne à lui, avec la phrase qui dit ce qu'il coûte. C'est le seul endroit du
 * jeu qui demande son format à JavaScript plutôt qu'à une règle `lg:` : monter
 * les deux arrangements pour n'en montrer qu'un mettrait deux `<input>` dans la
 * page, donc deux saisies en cours et une liste de suggestions qui n'est pas
 * celle qu'on voit (`use-desktop.ts`).
 *
 * Ce qui est au-dessus des deux ne bouge pas : la ligne d'état, les six jetons,
 * le bouton de passe, et le geste que « Valider » exécute — celui-là même que
 * la touche Entrée exécute dans le champ.
 */
export function EssaiBand({
  play,
  pending,
  verdict,
  onSubmit,
}: Readonly<{
  play: EnigmaPlay
  pending: boolean
  /** Le dernier essai, tant qu'il est un instant (`verdict.tsx`). */
  verdict: Verdict | null
  onSubmit: (proposal: FootballerSuggestion | null) => void
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

  const desktop = useDesktop()
  const left = triesLeft(play)
  const shake = useShake(verdict)

  // Pas désactivé par `pending`, contrairement au bouton : choisir une
  // suggestion est un geste délibéré à chaque fois, et deux choix sont deux
  // essais.
  const propose = (suggestion: FootballerSuggestion) => {
    onSubmit(suggestion)
  }

  const pass = () => {
    onSubmit(null)
  }

  return (
    <>
      <div className="flex items-center justify-between gap-[10px]">
        <span className="font-mono text-state text-ink">
          {left} essai{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''}
        </span>
        {/* Le jeton qui vient d'être dépensé se remplit sous les yeux : la
            dépense se voit là où elle se compte, et pas dans un message. */}
        <Tokens spent={play.triesUsed} filling={verdict === null ? null : verdict.triesUsed - 1} />
      </div>

      {desktop ? (
        <>
          {/* La rangée blanche est le champ : celui-ci n'a plus ni fond ni
              rembourrage, et « Valider » se range à son bord droit. */}
          <div
            onAnimationEnd={shake.onAnimationEnd}
            className={`rounded-row flex items-center gap-[10px] bg-white px-[14px] py-[13px] ${shake.className}`}
          >
            <div className="min-w-0 flex-1">
              <FootballerTypeahead
                label="Proposez un footballeur"
                placeholder="Tapez un nom de footballeur…"
                tone="game-inline"
                onHighlight={onHighlight}
                onSelect={propose}
              />
            </div>

            <SubmitButton
              choice={choice}
              pending={pending}
              className="btn rounded-field shrink-0 px-[20px] py-[10px] text-[13px]"
            />
          </div>

          <div className="flex items-center gap-3">
            <PassButton pending={pending} onPass={pass} />
            {/* La place existe ici, et elle sert à dire le prix en toutes
                lettres : le `−1` du bouton suffit sous le pouce, il ne se
                commente pas sur un écran de téléphone. */}
            <span className="text-note text-ink/70">
              Passer dévoile l’indice suivant et consomme un essai.
            </span>
          </div>
        </>
      ) : (
        <>
          <div onAnimationEnd={shake.onAnimationEnd} className={shake.className}>
            <FootballerTypeahead
              label="Proposez un footballeur"
              placeholder="Tapez un nom de footballeur…"
              tone="game"
              onHighlight={onHighlight}
              onSelect={propose}
            />
          </div>

          <div className="flex gap-2">
            <SubmitButton
              choice={choice}
              pending={pending}
              className="btn flex-1 py-[15px]"
            />
            <PassButton pending={pending} onPass={pass} />
          </div>
        </>
      )}
    </>
  )
}

type Choice = { suggestion: FootballerSuggestion; submit: () => void }

/**
 * « Valider » : le même geste et le même état désactivé dans les deux formats,
 * à la forme près — pleine largeur dans la rangée du téléphone, ramassé au bord
 * du champ sur l'ordinateur. La forme est donc ce que l'appelant passe, et rien
 * d'autre.
 */
function SubmitButton({
  choice,
  pending,
  className,
}: Readonly<{ choice: Choice | null; pending: boolean; className: string }>) {
  return (
    <button
      type="button"
      disabled={choice === null || pending}
      onClick={() => {
        choice?.submit()
      }}
      className={className}
    >
      {pending ? 'Envoi…' : 'Valider'}
    </button>
  )
}

/** Le tour qu'on passe, au rembourrage de chaque format. */
function PassButton({
  pending,
  onPass,
}: Readonly<{ pending: boolean; onPass: () => void }>) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onPass}
      className="rounded-row border-ink font-mono text-pass text-ink cursor-pointer border-[1.5px] px-4 py-[15px] disabled:opacity-50 lg:px-[15px] lg:py-[11px]"
    >
      PASSER −1
    </button>
  )
}

/** Les six jetons : pleins ce qui est dépensé, cerclés ce qui reste. */
function Tokens({
  spent,
  /** Le rang du jeton qui vient d'être dépensé, s'il vient de l'être. */
  filling,
}: Readonly<{ spent: number; filling: number | null }>) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: MAX_TRIES }, (_, index) => (
        <span
          key={index}
          className={`size-[12px] shrink-0 rounded-full border-2 ${
            index < spent ? 'bg-ink border-ink' : 'border-ink/35 bg-transparent'
          } ${index === filling ? 'animate-token' : ''}`}
        />
      ))}
    </div>
  )
}

/**
 * La secousse du champ quand un footballeur est refusé.
 *
 * Elle se retire d'elle-même à la fin de l'animation, et c'est ce qui la rend
 * rejouable : une classe CSS déjà posée ne relance rien, donc deux mauvaises
 * réponses de suite ne feraient trembler le champ qu'une fois. La retirer sur
 * `animationend` la rend disponible pour l'essai suivant.
 *
 * Un tour passé ne tremble pas. Il coûte le même essai, mais c'est le joueur
 * qui l'a choisi : l'écran n'a pas à le lui reprocher.
 */
function useShake(verdict: Verdict | null): {
  className: string
  onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void
} {
  const serial = verdict?.kind === 'wrong' ? verdict.serial : null
  // Le dernier essai déjà secoué, et non « est-ce que ça tremble » : une classe
  // CSS déjà posée ne relance rien, donc deux mauvaises réponses de suite ne
  // feraient trembler le champ qu'une fois. Retenir lequel a été secoué fait
  // retomber la classe à la fin de l'animation, et la rend disponible pour
  // l'essai suivant.
  const [shaken, setShaken] = useState<number | null>(null)

  return {
    className: serial !== null && serial !== shaken ? 'animate-shake' : '',
    // Les animations des enfants remontent aussi : seule celle de l'élément
    // lui-même met fin à la secousse.
    onAnimationEnd: (event) => {
      if (event.target === event.currentTarget) setShaken(serial)
    },
  }
}
