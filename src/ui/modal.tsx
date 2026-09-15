'use client'

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * La fenêtre dans laquelle un écran ouvre ce qu'on lui demande : les
 * statistiques du joueur, son compte, la grille d'un jour au back-office.
 *
 * Elle est à la racine de `src/ui` et non dans `game/` parce que les deux
 * moitiés de l'application s'en servent, comme du champ de recherche
 * (`footballer-typeahead.tsx`). Une seconde fenêtre écrite pour le back-office
 * aurait été une seconde façon de perdre le focus.
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
  wide = false,
  onClose,
  children,
}: Readonly<{
  open: boolean
  /** Le titre visible, qui est aussi le nom accessible de la fenêtre. */
  title: string
  /**
   * La fenêtre large, pour le seul contenu qui ne soit pas une colonne : les
   * trois positions d'une grille, qui se rangent côte à côte dès qu'il y a la
   * place. Les deux panneaux du jeu n'empilent que des lignes et une fenêtre
   * large les étirerait sans rien y ajouter.
   */
  wide?: boolean
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
      className={`rounded-card text-ink m-auto w-[calc(100%-2rem)] bg-white p-0 backdrop:bg-[#0b2e22]/55 ${
        wide ? 'max-w-3xl' : 'max-w-lg'
      }`}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
          <h2 id={titleId} className="field-label">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            // Une croix fait 10 px de large et se vise au doigt : la cible est
            // le carré autour d'elle, pas le glyphe.
            className="rounded-field text-muted hover:bg-crest -mr-2 flex size-9 shrink-0 cursor-pointer items-center justify-center text-lg leading-none"
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
