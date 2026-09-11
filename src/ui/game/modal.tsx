'use client'

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * La fenêtre dans laquelle la grille ouvre ce qu'on lui demande : une énigme,
 * les statistiques.
 *
 * C'est le `<dialog>` natif et pas une `div` posée par-dessus la page, pour
 * trois choses qu'il fait seul et qu'on écrirait mal : le fond de la page
 * devient inerte, Échap ferme, et le focus reste à l'intérieur. Un jeu dont
 * l'unique champ est une liste de suggestions au clavier ne peut pas se
 * permettre de perdre le focus derrière un voile.
 *
 * ## Ouvert est une prop, pas un attribut
 *
 * `showModal()` et l'attribut `open` ne donnent pas la même fenêtre — le second
 * affiche la boîte sans backdrop ni inertie. React ne connaît que des attributs,
 * donc l'ouverture passe par un effet qui appelle la méthode, et l'élément n'a
 * jamais `open` dans son JSX. Le chemin de retour est l'événement `close`, que
 * l'élément émet aussi bien sur Échap que sur `close()` : le parent apprend la
 * fermeture par là, et pas par les seuls boutons qu'on lui a dessinés.
 *
 * Le clic sur le fond ferme aussi, et se reconnaît à sa cible : le backdrop
 * appartient au `<dialog>` lui-même, donc un clic dont la cible est un
 * `<dialog>` est un clic à côté du contenu, qui, lui, est dans un enfant.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: Readonly<{
  open: boolean
  /** Le titre visible, qui est aussi le nom accessible de la fenêtre. */
  title: string
  onClose: () => void
  children: ReactNode
}>) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Le titre visible est aussi le nom accessible : une fenêtre annoncée
  // « dialogue » et rien d'autre ne dit pas ce qu'on vient d'ouvrir.
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (element === null) return

    // Les deux appels sont gardés : `showModal()` sur une boîte déjà ouverte
    // lève, et `close()` sur une boîte fermée réémettrait un `close`.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // La cible est le `<dialog>` lui-même : le backdrop lui appartient,
        // alors que le contenu est dans un enfant. C'est donc un clic à côté.
        if (event.target instanceof HTMLDialogElement) onClose()
      }}
      // `m-auto` parce que le reset de Tailwind met toutes les marges à zéro et
      // qu'un `<dialog>` modal se centre précisément par `margin: auto`.
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-neutral-900/50"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <h2
            id={titleId}
            className="text-sm font-medium tracking-wide text-neutral-500 uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </header>

        {/* Le contenu défile, l'en-tête reste : une énigme dont tous les indices
            sont dévoilés dépasse la hauteur d'un téléphone. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  )
}
