'use client'

import type { ReactNode } from 'react'

import { GameHeader, ScreenColumn, ScrollBody } from './chrome'
import { DesktopRail } from './rail'
import { useGame } from './game-provider'

/**
 * Un écran du jeu qui n'a pas de grille à montrer, et qui dit pourquoi.
 *
 * Quatre raisons aujourd'hui — le jour sans grille programmée, et les trois de
 * l'archive : une journée verrouillée faute de compte, une journée qui n'est pas
 * venue, une journée passée sans grille. Elles ont toutes la même forme : le
 * châssis entier, un titre, une phrase, et parfois un geste. Séparer les raisons
 * est le travail de l'appelant ; ce fichier tient le cadre.
 *
 * Et le cadre est tout l'enjeu : **l'en-tête reste**, donc le compte aussi. Ce
 * qu'elle ouvre n'appartient pas à la journée — la série est derrière le joueur,
 * l'adresse qu'il connecte est devant lui — et un écran de refus qui emporterait
 * le compte avec lui serait une porte fermée à clé sur le trousseau. C'est vrai
 * du jour sans grille, et c'est la fonctionnalité même de la journée
 * verrouillée : s'y connecter est ce qui l'ouvre.
 *
 * Le rail de l'ordinateur reste pour la même raison, et arrive vide de la
 * journée : ni date, ni thème, ni les trois niveaux (`rail.tsx`).
 */
export function GridMessage({
  title,
  children,
  action,
}: Readonly<{ title: string; children: ReactNode; action?: ReactNode }>) {
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
            <h1 className="font-display text-score text-white">{title}</h1>
            <p className="font-mono text-meta text-ink">{children}</p>
            {action}
          </div>
        </ScrollBody>
      </ScreenColumn>
    </>
  )
}
