'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

import type { DailyGrid } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { PlayerStats } from '@/shared/stats'
import type { Position } from '@/shared/schedule'

import { GameShell } from './chrome'
import { Modal } from './modal'
import { PlayerStatsPanel } from './player-stats'
import { useDayPlays } from './use-day-plays'
import type { PersonalState } from './use-day-plays'

/**
 * Ce que tous les écrans du jeu partagent, monté une seule fois au-dessus
 * d'eux : la grille du jour, la progression du joueur, et la fenêtre des
 * statistiques.
 *
 * Il est dans le **layout** et non dans chaque page, et c'est ce qui rend les
 * trois URL de niveau tenables : passer de `/1` à `/2` est une navigation
 * client, le layout ne se remonte pas, donc `POST /api/game/state` n'est appelé
 * qu'une fois pour toute la visite. Si l'état vivait dans la page, chaque
 * changement de niveau referait la requête et rejouerait l'écran de
 * chargement — les indices déjà dévoilés disparaîtraient une demi-seconde à
 * chaque aller-retour.
 *
 * La grille, elle, vient du serveur : c'est le layout qui l'a lue, en statique,
 * et elle descend ici en prop. Rien de ce fichier ne lit de requête.
 */
type Game = {
  grid: DailyGrid
  state: PersonalState
  stats: PlayerStats | null | undefined
  pending: ReadonlySet<Position>
  playAt: (position: Position) => EnigmaPlay | undefined
  open: (position: Position) => void
  submit: (position: Position, footballerId: string | null) => void
  openStats: () => void
}

const GameContext = createContext<Game | null>(null)

export function GameProvider({
  grid,
  children,
}: Readonly<{ grid: DailyGrid; children: ReactNode }>) {
  const { state, open, submit, pending, stats } = useDayPlays(grid.date)
  const [statsOpen, setStatsOpen] = useState(false)

  const game: Game = {
    grid,
    state,
    stats,
    pending,
    playAt: (position) => (state.status === 'ready' ? state.plays.get(position) : undefined),
    open,
    submit,
    openStats: () => {
      setStatsOpen(true)
    },
  }

  return (
    <GameContext value={game}>
      <GameShell>{children}</GameShell>

      <Modal
        open={statsOpen}
        title="Vos statistiques"
        onClose={() => {
          setStatsOpen(false)
        }}
      >
        <PlayerStatsPanel stats={stats} />
      </Modal>
    </GameContext>
  )
}

export function useGame(): Game {
  const game = useContext(GameContext)
  // Un écran de jeu rendu hors du layout du jeu est un bug de routage, pas un
  // cas à gérer : mieux vaut l'erreur que trois écrans vides.
  if (game === null) throw new Error('Un écran du jeu doit être rendu sous GameProvider.')

  return game
}
