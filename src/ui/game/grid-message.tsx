'use client'

import type { ReactNode } from 'react'

import { formatGridDate } from '@/shared/schedule'

import { GameHeader, GridTitle, ScreenColumn, ScrollBody } from './chrome'
import { DayNav } from './day-nav'
import { DesktopRail } from './rail'
import { useDay, useGame } from './game-provider'

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
 * Le rail de l'ordinateur reste pour la même raison (`rail.tsx`).
 *
 * ## Et la journée reste aussi
 *
 * L'en-tête porte **sa date et ses deux flèches**, exactement comme un jour qui
 * a une grille. Ce qui manque est la grille, pas le jour : « pas de grille » ne
 * se lit bien qu'au-dessus de la date dont on parle, et sans les flèches un
 * trou rencontré en remontant l'archive était un cul-de-sac — le seul chemin
 * pour en sortir repassait par le calendrier, alors que le geste voulu était de
 * continuer d'un jour. C'est la raison pour laquelle la date vit sur le
 * provider et non sur la grille (`game-provider.tsx`).
 *
 * Pas de pastille de thème : il n'y a pas de grille, donc pas de thème, et
 * `GridTitle` s'en passe plutôt que d'en inventer un.
 */
export function GridMessage({
  title,
  children,
  action,
}: Readonly<{ title: string; children: ReactNode; action?: ReactNode }>) {
  const { date } = useDay()
  const { openStats, openAccount, account } = useGame()

  return (
    <>
      <DesktopRail active={null} />

      <ScreenColumn>
        <GameHeader
          onStats={openStats}
          onAccount={openAccount}
          accountInitial={account.initial}
        >
          <GridTitle date={formatGridDate(date)} nav={<DayNav />} />
        </GameHeader>

        <ScrollBody>
          <div className="flex h-full flex-col justify-center gap-3">
            {/* `h2` : le titre de l'écran est désormais la date, en en-tête.
                C'est la journée dont on parle, et « pas de grille » est ce
                qu'on en dit — un second `h1` aurait fait deux titres de page
                pour un seul jour. */}
            <h2 className="font-display text-score text-white">{title}</h2>
            <p className="font-mono text-meta text-ink">{children}</p>
            {action}
          </div>
        </ScrollBody>
      </ScreenColumn>
    </>
  )
}
