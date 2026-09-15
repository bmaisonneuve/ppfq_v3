'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

import type { DailyGrid } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { FootballerSuggestion } from '@/shared/search'
import type { PlayerStats } from '@/shared/stats'
import type { Position } from '@/shared/schedule'
import { Modal } from '@/ui/modal'

import { AccountPanelView } from './account-panel'
import { GameShell } from './chrome'
import { PlayerStatsPanel } from './player-stats'
import { useAccount } from './use-account'
import type { Account } from './use-account'
import { useDayPlays } from './use-day-plays'
import type { PersonalState } from './use-day-plays'
import type { Verdict } from './verdict'

/**
 * Ce que tous les écrans du jeu partagent, monté une seule fois au-dessus
 * d'eux : la grille du jour, la progression du joueur, et la fenêtre des
 * statistiques.
 *
 * Il est monté **même les jours sans grille**, et c'est ce que `grid: null`
 * veut dire. Ce qu'il porte n'appartient pas tout entier à la journée : la
 * série, les cartons pleins, l'adresse connectée sont au joueur, et un
 * calendrier incomplet n'est pas une raison de lui fermer son compte. L'écran
 * d'attente garde donc son en-tête et ses deux fenêtres ; il n'a de moins que
 * ce qui manque vraiment, la grille.
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
  /** La grille du jour, ou `null` le jour où rien n'est programmé. */
  grid: DailyGrid | null
  state: PersonalState
  stats: PlayerStats | null | undefined
  pending: ReadonlySet<Position>
  playAt: (position: Position) => EnigmaPlay | undefined
  open: (position: Position) => void
  submit: (position: Position, proposal: FootballerSuggestion | null) => void
  /**
   * Le dernier essai joué, quel que soit le niveau sur lequel il l'a été.
   *
   * Il est ici parce qu'il survit à la navigation, comme la progression : le
   * layout ne se remonte pas d'un niveau à l'autre. Un écran le filtre par sa
   * position et lit lui-même s'il est encore un instant — `verdictAt` et
   * `isLive`, dans `verdict.tsx`.
   */
  verdict: Verdict | null
  openStats: () => void
  /**
   * Le compte (#13). Il est ici et pas dans chaque écran pour la même raison
   * que la progression : le layout ne se remonte pas d'un niveau à l'autre,
   * donc « qui est connecté » se lit une fois pour toute la visite — et surtout
   * le compte partage **la file** de la progression, parce que se connecter
   * repose le cookie du joueur et qu'une requête d'état qui reviendrait après
   * reposerait l'ancienne valeur.
   */
  account: Account
  openAccount: () => void
}

const GameContext = createContext<Game | null>(null)

export function GameProvider({
  grid,
  children,
}: Readonly<{ grid: DailyGrid | null; children: ReactNode }>) {
  const { state, open, submit, verdict, pending, stats, enqueue } = useDayPlays(
    grid?.date ?? null,
  )
  const account = useAccount(enqueue)
  const [statsOpen, setStatsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const game: Game = {
    grid,
    state,
    stats,
    pending,
    playAt: (position) => (state.status === 'ready' ? state.plays.get(position) : undefined),
    open,
    submit,
    verdict,
    openStats: () => {
      setStatsOpen(true)
    },
    account,
    openAccount: () => {
      setAccountOpen(true)
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

      <Modal
        open={accountOpen}
        title={account.panel.step === 'signed-in' ? 'Votre compte' : 'Se connecter'}
        onClose={() => {
          setAccountOpen(false)
        }}
      >
        <AccountPanelView account={account} />
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

/**
 * La grille, pour les écrans qui n'existent que s'il y en a une.
 *
 * C'est le layout qui décide : sans grille il rend l'écran d'attente à la place
 * de la page, donc l'accueil et les trois niveaux ne sont montés que les jours
 * où `grid` est là. Le dire par une exception plutôt que par un `?.` à chaque
 * ligne garde cette garantie lisible — et la rend bruyante le jour où le
 * routage la perd, au lieu de la laisser se traduire en trois cartes vides.
 */
export function useGrid(): DailyGrid {
  const { grid } = useGame()
  if (grid === null) throw new Error('Cet écran du jeu suppose une grille du jour.')

  return grid
}
