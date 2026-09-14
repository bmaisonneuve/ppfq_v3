'use client'

import { GameHeader, ScreenColumn, ScrollBody } from './chrome'
import { DesktopRail } from './rail'
import { useGame } from './game-provider'

/**
 * Le jour où rien n'est programmé.
 *
 * Son en-tête n'a pas de titre de journée : sans grille il n'y a ni date, ni
 * thème, ni niveau à ouvrir — une barre segmentée vide et une pastille de thème
 * absente feraient un écran cassé là où il n'y a qu'un calendrier incomplet.
 *
 * La barre elle-même reste, et ce n'est pas de la décoration. Ce qu'elle ouvre
 * n'appartient pas à la journée : la série et les cartons pleins sont derrière
 * le joueur, l'adresse qu'il connecte est devant lui, et ni l'une ni l'autre
 * n'attend qu'on ait programmé une grille. Un écran d'attente qui emporterait
 * le compte avec lui serait une panne pour quelqu'un venu se connecter — alors
 * qu'il n'y a qu'une grille qui manque.
 *
 * Le rail de l'ordinateur reste pour la même raison, et pour la même raison il
 * arrive vide de la journée : ni date, ni thème, ni les trois niveaux — il n'y
 * a que la marque, le compte et les chiffres du joueur (`rail.tsx`).
 */
export function NoGridView() {
  const { openStats, openAccount, account } = useGame()

  return (
    <>
      <DesktopRail active={null} />

      <ScreenColumn>
        <GameHeader
          onStats={openStats}
          onAccount={openAccount}
          accountInitial={account.initial}
        />

        <ScrollBody>
          <div className="flex h-full flex-col justify-center gap-3">
            <h1 className="font-display text-score text-white">Pas de grille aujourd’hui</h1>
            <p className="font-mono text-meta text-ink">
              Aucune grille n’est programmée pour la journée. Revenez demain.
            </p>
          </div>
        </ScrollBody>
      </ScreenColumn>
    </>
  )
}
