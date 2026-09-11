'use client'

import { useEffect, useState } from 'react'

import { isShareable, sharedSummary } from '@/shared/summary'
import type { SummarySource } from '@/shared/summary'

/**
 * Le résumé partagé, et le geste qui le copie.
 *
 * Tout ce que ce composant affiche est dérivé à l'instant où il s'affiche
 * (`shared/summary.ts`) : rien n'a été écrit en base pour le produire, rien ne
 * l'a été pour le copier, et il n'existe pas d'identifiant de résumé à donner
 * à qui que ce soit (`docs/modele-donnees.md` §9).
 *
 * **Le texte est à l'écran avant d'être dans le presse-papiers**, et ce n'est
 * pas une prévisualisation de confort. Un joueur qui colle ce résumé le colle
 * devant des gens qui n'ont pas encore joué : il doit pouvoir lire ce qu'il
 * partage. C'est aussi ce qui rend le refus du presse-papiers supportable —
 * sur un contexte non sécurisé ou sans permission, l'API échoue, et le texte
 * reste là, sélectionnable à la main.
 *
 * ## Il n'apparaît pas tant qu'aucune partie n'a été jouée
 *
 * Le garde-fou est dans `isShareable`, pas ici, parce que c'est une règle et
 * non une mise en page : sans lui, une grille simplement ouverte proposerait un
 * bilan de trois échecs à quelqu'un qui n'a rien fait
 * (`docs/modele-donnees.md` §8). Les specs §8 parlent de la *fin* de la grille
 * et le modèle d'*au moins une partie jouée* : c'est le second qui est retenu,
 * parce qu'un joueur qui a trouvé son titulaire et laissé la légende a bien un
 * résultat, et qu'aucune des trois parties n'a de fin à attendre — une grille
 * ne se « termine » que le lendemain, quand elle a tourné.
 */
export function ShareSummary({ source }: Readonly<{ source: SummarySource }>) {
  const [copy, setCopy] = useState<CopyState>('idle')

  // Le résumé est le texte affiché : deux dérivations — une pour l'écran, une
  // pour le presse-papiers — seraient deux occasions de partager autre chose
  // que ce qu'on a lu.
  const summary = isShareable(source.plays) ? sharedSummary(source) : null

  // « Copié » est une confirmation, pas un état : elle s'efface d'elle-même, et
  // le bouton redevient ce qu'il était. Le nettoyage est ce qui empêche un
  // résumé recopié juste après d'annoncer sa réussite puis de l'oublier.
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
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        Partager votre grille
      </h2>

      {/* `<pre>` et non un paragraphe : les trois lignes sont un alignement, et
          la moindre reflow les décalerait les unes par rapport aux autres.
          Sélectionnable, donc copiable à la main si l'API refuse. */}
      <pre className="leading-relaxed whitespace-pre-wrap">{summary}</pre>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(summary).then(setCopy)
          }}
          className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        >
          Copier le résumé
        </button>

        <p aria-live="polite" className="text-sm text-neutral-600">
          {MESSAGES[copy]}
        </p>
      </div>
    </section>
  )
}

/**
 * Le presse-papiers, et ce qu'on en dit quand il refuse.
 *
 * Le `try` couvre `navigator.clipboard` lui-même et pas seulement la promesse
 * qu'il rend : sur un contexte non sécurisé la propriété n'existe pas, donc
 * l'appel lève **avant** qu'il y ait une promesse à rejeter. Un
 * `.then(ok, ko)` ne verrait jamais ce refus-là, qui est pourtant le plus
 * probable des trois — les deux autres étant une permission refusée et un
 * navigateur sans l'API.
 *
 * Les trois se disent pareil, puisque le joueur n'y peut rien et que le texte
 * est déjà sous ses yeux, à sélectionner.
 */
async function copyToClipboard(summary: string): Promise<Exclude<CopyState, 'idle'>> {
  try {
    await navigator.clipboard.writeText(summary)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** Le bouton avant qu'on lui demande quoi que ce soit, et ses deux réponses. */
type CopyState = 'idle' | 'copied' | 'failed'

/** Ce que le bouton répond. Rien à dire tant qu'on ne lui a rien demandé. */
const MESSAGES: Record<CopyState, string> = {
  idle: '',
  copied: 'Copié.',
  failed: 'La copie a échoué — sélectionnez le texte ci-dessus.',
}

/** Assez pour être lu, assez court pour ne pas survivre à un second clic. */
const CONFIRMATION_MS = 3000
