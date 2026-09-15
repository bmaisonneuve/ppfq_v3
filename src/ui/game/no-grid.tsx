'use client'

import { GridMessage } from './grid-message'

/**
 * Le jour où rien n'est programmé.
 *
 * Son en-tête n'a pas de titre de journée : sans grille il n'y a ni date, ni
 * thème, ni niveau à ouvrir — une barre segmentée vide et une pastille de thème
 * absente feraient un écran cassé là où il n'y a qu'un calendrier incomplet.
 *
 * La barre elle-même reste, et ce n'est pas de la décoration : c'est le sujet de
 * `grid-message.tsx`, dont cet écran a été le premier cas et n'est plus le seul.
 */
export function NoGridView() {
  return (
    <GridMessage title="Pas de grille aujourd’hui">
      Aucune grille n’est programmée pour la journée. Revenez demain.
    </GridMessage>
  )
}
