'use client'

import { useEffect, useState } from 'react'

import { isShareable, sharedSummary, summaryLines } from '@/shared/summary'
import type { SummarySource } from '@/shared/summary'
import { POSITIONS, positionTitle } from '@/shared/schedule'

import { PrimaryButton } from './chrome'

/**
 * « Copier mon résultat » : l'action principale du bandeau quand la journée est
 * finie.
 *
 * Le résumé n'est jamais stocké — il se dérive des trois parties et de la
 * grille à chaque affichage (CONTEXT.md) — et il n'est proposé qu'à partir du
 * premier essai consommé : une grille simplement dépliée produirait sinon un
 * bilan de trois échecs.
 *
 * Le texte copié n'est pas affiché ici. Il l'était tant que le partage vivait
 * dans une carte à lui ; le handoff en fait un bouton du bandeau, et trois
 * lignes de carrés de couleur sous un bouton du bandeau n'ont plus de place où
 * s'aligner. Ce qui reste visible, c'est la confirmation — et l'aveu quand le
 * presse-papier refuse, parce qu'un clic sans effet est pire qu'une erreur.
 */
export function CopyResultButton({ source }: Readonly<{ source: SummarySource }>) {
  const { state, copy } = useCopy()

  const summary = isShareable(source.plays) ? sharedSummary(source) : null

  if (summary === null) return null

  return (
    <>
      <PrimaryButton
        label="Copier mon résultat"
        onClick={() => {
          copy(summary)
        }}
      />

      <CopyNotice state={state} />
    </>
  )
}

/**
 * Le résultat de la journée en cours, montré sur l'ordinateur — les trois
 * lignes de carrés, et de quoi les copier.
 *
 * Deux différences avec le bouton du bandeau, et elles vont ensemble :
 *
 * - **il n'attend pas la fin de la journée.** Le seul garde-fou est celui du
 *   modèle — au moins un essai dépensé (`isShareable`), sinon une grille
 *   simplement ouverte produirait un bilan de trois échecs — et les lignes
 *   savent déjà dire une partie en cours : des carrés dépensés, puis du vide ;
 * - **il montre ce qu'il copie.** Le bandeau du téléphone n'a pas de place où
 *   aligner trois lignes de carrés sous un bouton ; la zone principale d'un
 *   grand écran, elle, en a de reste, et c'est précisément le vide que ce
 *   panneau vient occuper sous les trois cartes.
 *
 * `lg:` sans condition : sur le téléphone, le résultat reste ce que le bandeau
 * propose à la fin. Deux formats, deux moments — un seul résumé.
 */
export function DayResultCard({ source }: Readonly<{ source: SummarySource }>) {
  const { state, copy } = useCopy()

  const summary = isShareable(source.plays) ? sharedSummary(source) : null
  const lines = summaryLines(source.plays)

  if (summary === null) return null

  return (
    <section className="rounded-card hidden flex-col gap-3 bg-white p-[14px] lg:flex">
      <div className="flex items-center justify-between gap-3">
        <h3 className="field-label">Votre résultat</h3>

        <button
          type="button"
          onClick={() => {
            copy(summary)
          }}
          className="font-mono text-cta text-ink cursor-pointer p-1 uppercase"
        >
          Copier ›
        </button>
      </div>

      {/* Une liste et non un bloc préformaté : chaque ligne porte le nom de son
          niveau pour qui ne voit pas les couleurs, et le texte collé, lui,
          reste la suite de carrés que `sharedSummary` compose. */}
      <ol className="flex flex-col gap-[6px]">
        {POSITIONS.map((position, index) => (
          <li key={position} className="flex items-center gap-3">
            <span className="font-mono text-meta text-ink/55 w-[108px] shrink-0">
              {positionTitle(position)}
            </span>
            <span className="text-body tracking-[0.12em]">{lines[index]}</span>
          </li>
        ))}
      </ol>

      <CopyNotice state={state} />
    </section>
  )
}

/** Ce que la copie a répondu, quand elle a répondu quelque chose. */
function CopyNotice({ state }: Readonly<{ state: CopyState }>) {
  if (state === 'idle') return null

  return (
    <p aria-live="polite" className="font-mono text-meta text-ink/70">
      {MESSAGES[state]}
    </p>
  )
}

/**
 * Copier, et oublier au bout de trois secondes.
 *
 * Un hook plutôt qu'un composant : les deux endroits qui copient n'ont pas la
 * même forme — un bouton de bandeau, un panneau sur l'ordinateur — mais ont le
 * même après-coup, confirmation comprise. C'est l'aveu qui compte le plus :
 * `navigator.clipboard` n'existe pas hors contexte sécurisé et son refus est
 * silencieux, donc sans message le joueur croit avoir copié.
 */
function useCopy(): { state: CopyState; copy: (summary: string) => void } {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return

    const timer = setTimeout(() => {
      setState('idle')
    }, CONFIRMATION_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [state])

  return {
    state,
    copy: (summary) => {
      void copyToClipboard(summary).then(setState)
    },
  }
}

async function copyToClipboard(summary: string): Promise<Exclude<CopyState, 'idle'>> {
  try {
    await navigator.clipboard.writeText(summary)
    return 'copied'
  } catch {
    // `navigator.clipboard` n'existe pas hors contexte sécurisé et le refus est
    // silencieux : sans ce message le joueur croit avoir copié.
    return 'failed'
  }
}

type CopyState = 'idle' | 'copied' | 'failed'

const MESSAGES: Record<CopyState, string> = {
  idle: '',
  copied: 'Copié.',
  failed: 'La copie a échoué.',
}

const CONFIRMATION_MS = 3000
