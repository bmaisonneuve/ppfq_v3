'use client'

import { useEffect, useState } from 'react'

import { isShareable, sharedSummary } from '@/shared/summary'
import type { SummarySource } from '@/shared/summary'

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
  const [copy, setCopy] = useState<CopyState>('idle')

  const summary = isShareable(source.plays) ? sharedSummary(source) : null

  useEffect(() => {
    if (copy === 'idle') return

    const timer = setTimeout(() => {
      setCopy('idle')
    }, CONFIRMATION_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [copy])

  if (summary === null) return null

  return (
    <>
      <PrimaryButton
        label="Copier mon résultat"
        onClick={() => {
          void copyToClipboard(summary).then(setCopy)
        }}
      />

      {copy === 'idle' ? null : (
        <p aria-live="polite" className="font-mono text-meta text-ink/70">
          {MESSAGES[copy]}
        </p>
      )}
    </>
  )
}

export function isDayShareable(source: SummarySource): boolean {
  return isShareable(source.plays)
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
