import type { ReactNode } from 'react'

import { getDailyGrid } from '@/server/services/grid.service'
import { GameProvider } from '@/ui/game/game-provider'
import { NoGridView } from '@/ui/game/no-grid'

/**
 * Ce que la journée du jeu a de commun à tous ses écrans : la grille.
 *
 * Elle est lue **ici** et non dans chaque page parce que les quatre écrans du
 * jeu — l'aperçu et les trois niveaux — sont la même journée regardée de quatre
 * endroits. Le layout ne se remonte pas d'une navigation à l'autre, donc la
 * progression du joueur (`GameProvider`) survit au passage de `/1` à `/2` : une
 * seule requête personnelle pour toute la visite, et aucun écran de chargement
 * entre deux niveaux.
 *
 * Comme la page, ce layout ne lit rien qui appartienne à une requête — ni
 * cookie, ni en-tête, ni paramètre. C'est la condition pour que les quatre
 * routes restent prérendues et servies depuis un cache partagé, et
 * `test/architecture/static-game-page.test.ts` le vérifie ligne à ligne : une
 * lecture de requête ici rendrait dynamique tout ce qui est en dessous.
 */
export const revalidate = 60

export default async function GameLayout({ children }: Readonly<{ children: ReactNode }>) {
  const grid = await getDailyGrid()

  // Sans grille il n'y a pas de niveau à ouvrir : les trois URL de niveau
  // aboutissent au même écran d'attente que l'accueil, plutôt qu'à une barre
  // segmentée vide.
  if (grid === null) return <NoGridView />

  return <GameProvider grid={grid}>{children}</GameProvider>
}
