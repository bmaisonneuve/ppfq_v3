'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

import { DAILY_BASE, archiveBase } from '@/shared/archive'
import type { GridBase } from '@/shared/archive'
import type { DailyGrid } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { FootballerSuggestion } from '@/shared/search'
import type { PlayerStats } from '@/shared/stats'
import type { ChallengeDate, Position } from '@/shared/schedule'
import { Modal } from '@/ui/modal'

import { AccountPanelView } from './account-panel'
import { GameShell } from './chrome'
import { PlayerStatsPanel } from './player-stats'
import { useAccount } from './use-account'
import type { Account } from './use-account'
import { isStaleGrid, useDayPlays } from './use-day-plays'
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
 *
 * ## Le même provider pour le quotidien et pour l'archive
 *
 * « La mécanique de jeu en archive est identique à celle du quotidien » (specs
 * §7), et c'est ici que cette phrase coûte quelque chose : les deux moitiés
 * partagent ce provider, les quatre écrans et la file de requêtes.
 *
 * Tout ce qui les sépare tient dans **une** prop, `archiveDate` — la journée
 * dont ces écrans-là parlent, absente sur la grille du jour. Une seule, parce
 * que deux qui disent la même chose finissent par se contredire : le préfixe
 * des liens et le fait d'être en archive s'en déduisent tous les deux ici, une
 * fois, et rien en dessous ne peut les désaccorder.
 *
 * Elle est renseignée **même quand il n'y a pas de grille** — une journée
 * verrouillée, un jour sans grille — parce que ce que l'écran montre alors
 * reste de l'archive : ses statistiques, et son en-tête.
 *
 * `today` s'ajoute à elle sans rien séparer : c'est l'horloge du serveur, la
 * même des deux côtés, et elle ne sert qu'à dire jusqu'où les flèches de
 * l'en-tête avancent. Les deux se rejoignent en une seule valeur, `day`, qui
 * donne aussi sa date au jour sans grille du quotidien — lequel n'en avait
 * aucune à lire.
 *
 * Le mode, lui, n'est pas ici et n'y sera jamais : il se déduit de la date côté
 * serveur (ADR-0016). Ce que `archiveDate` dit est de quelle journée on parle,
 * pas ce que la partie vaut.
 */
type Game = {
  /** La grille affichée, ou `null` le jour où rien n'est programmé. */
  grid: DailyGrid | null
  /**
   * La journée à l'écran, ou `null` sur l'index de l'archive.
   *
   * Elle est là **avec ou sans grille**, et c'est tout l'intérêt : c'est ce qui
   * distingue « il n'y a pas de grille » de « il n'y a pas de grille *ce
   * jour-là* ». Un trou se titre, se date, et laisse passer à la veille comme
   * n'importe quelle autre journée ; lire `grid.date` aurait perdu le jour en
   * même temps que la grille, et c'est justement l'écran qui en a le plus
   * besoin (`grid-message.tsx`).
   *
   * `null` pour le calendrier de l'archive, le seul écran du jeu qui ne parle
   * d'aucune journée en particulier — il les montre toutes.
   */
  day: Day | null
  /**
   * D'où partent les liens de ces écrans-là : rien pour le quotidien,
   * `/archive/<date>` pour une grille passée (`shared/archive.ts`).
   */
  base: GridBase
  /**
   * Vrai quand ces écrans sont ceux de l'archive.
   *
   * Ce qu'il change à l'écran tient en trois retenues, et chacune est une règle
   * plutôt qu'un goût : pas de série — l'archive n'en a pas (specs §7) —, pas
   * de résumé partagé — il est celui de la grille du jour (specs §8) —, et pas
   * de compte à rebours, puisque aucune nouvelle grille n'arrive ici.
   */
  archive: boolean
  /**
   * Vrai quand la grille à l'écran n'est plus celle du jour — la page est
   * servie depuis un cache partagé pendant une minute (ADR-0008), donc un
   * joueur qui arrive à minuit peut tenir celle de la veille.
   *
   * Lu ici et pas à chaque écran : c'est la même phrase à deux endroits, et
   * elle porte une exception — une journée d'archive ne « tourne » jamais, elle
   * est datée par son adresse.
   */
  stale: boolean
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

/**
 * La journée à l'écran : de quel jour on parle, et quel jour on est.
 *
 * Les deux ensemble et jamais l'une sans l'autre, parce qu'aucune ne suffit :
 * la première date l'en-tête, la seconde dit jusqu'où ses flèches avancent —
 * il n'y a pas de lendemain à proposer au-delà d'aujourd'hui
 * (`dayNeighbours`). Sur la grille du jour elles sont égales, et c'est bien le
 * cas particulier et non la règle.
 *
 * `today` vient du serveur et de nulle part ailleurs : l'horloge du navigateur
 * n'a pas voix au chapitre (ADR-0016), et une journée passée reste datée par
 * son adresse quoi qu'il arrive entre-temps.
 */
export type Day = { date: ChallengeDate; today: ChallengeDate }

const GameContext = createContext<Game | null>(null)

export function GameProvider({
  grid,
  today,
  archiveDate,
  children,
}: Readonly<{
  grid: DailyGrid | null
  /**
   * Aujourd'hui à Paris, lu par le serveur au rendu. La seule horloge.
   *
   * Absent sur l'index de l'archive, et là seulement : cet écran-là ne parle
   * d'aucune journée, donc il n'a ni date à titrer ni voisines à proposer — son
   * calendrier porte son propre `today`, pour marquer la case du jour.
   */
  today?: ChallengeDate
  /** La journée de l'archive dont ces écrans parlent. Absente : la grille du jour. */
  archiveDate?: ChallengeDate
  children: ReactNode
}>) {
  const archive = archiveDate !== undefined
  const base: GridBase = archiveDate === undefined ? DAILY_BASE : archiveBase(archiveDate)
  const { state, open, submit, verdict, pending, stats, enqueue } = useDayPlays(
    grid?.date ?? null,
    archiveDate ?? null,
  )
  const account = useAccount(enqueue)
  const [statsOpen, setStatsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const game: Game = {
    grid,
    // Une journée d'archive est celle de son adresse ; sinon c'est le jour même.
    day: today === undefined ? null : { date: archiveDate ?? today, today },
    base,
    archive,
    // Une journée d'archive est datée par son adresse : elle ne peut pas avoir
    // tourné, et proposer de recharger n'y changerait rien.
    stale: !archive && grid !== null && isStaleGrid(state, grid.date),
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
        // Le titre dit lequel des deux comptes on regarde : « l'archive est
        // comptée séparément » (specs §7), et un panneau qui ne le dirait pas
        // se lirait comme une série perdue.
        title={archive ? 'Vos statistiques d’archive' : 'Vos statistiques'}
        onClose={() => {
          setStatsOpen(false)
        }}
      >
        <PlayerStatsPanel stats={stats} archive={archive} />
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

/**
 * La journée à l'écran, pour les écrans qui n'existent que s'il y en a une.
 *
 * Le pendant de `useGrid` un cran plus haut : presque tous les écrans du jeu
 * parlent d'un jour, y compris ceux qui n'ont pas de grille à montrer. Le seul
 * qui n'en parle pas est l'index de l'archive, et il ne monte aucun de ces
 * composants-là — c'est le rail, partagé avec lui, qui lit `day` directement et
 * se tait quand il est nul.
 */
export function useDay(): Day {
  const { day } = useGame()
  if (day === null) throw new Error('Cet écran du jeu suppose une journée.')

  return day
}
