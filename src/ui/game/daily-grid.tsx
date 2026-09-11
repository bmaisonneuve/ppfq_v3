'use client'

import { useState } from 'react'

import type { DailyGrid } from '@/shared/grid'
import type { Position } from '@/shared/schedule'

import { EnigmaCard } from './enigma-card'
import { EnigmaDialog } from './enigma-dialog'
import { Modal } from './modal'
import { StaleGridNotice, UnavailableNotice } from './notices'
import { PlayerStatsPanel } from './player-stats'
import { isStaleGrid, playAt, useDayPlays } from './use-day-plays'

/**
 * La grille du jour, telle que le joueur la lit et la joue : son thème, ses
 * trois énigmes, et deux fenêtres qui s'ouvrent par-dessus.
 *
 * Trois propriétés de cet écran sont des règles du jeu et non de la mise en
 * page :
 *
 * - **Les trois énigmes sont là.** Aucun déverrouillage séquentiel : bloquer
 *   sur l'échauffement ne doit pas coûter le reste de la journée (specs §2).
 * - **Aucune n'est ouverte.** Une partie naît à l'ouverture d'une énigme
 *   (`docs/modele-donnees.md` §4), donc une énigme ouverte d'office ferait
 *   compter une personne exposée à chaque arrivée sur la page — et laisserait
 *   au passage une partie inachevée, que le changement de grille lit comme un
 *   échec.
 * - **Ouvrir est ce qui crée la partie.** Le clic sur une carte fait les deux
 *   d'un coup : il ouvre la fenêtre et il demande la partie au serveur.
 *
 * C'est pour cette dernière raison que tout ceci est un composant client, et la
 * fenêtre a réglé seule ce que le dépliant natif laissait ouvert : un
 * `<details>` s'ouvre **sans JavaScript**, donc un joueur qui touchait le
 * titulaire entre le premier rendu et l'hydratation ouvrait une énigme sans
 * créer de partie, et l'hydratation devait aller relire le DOM pour le
 * rattraper (ADR-0009). Un bouton n'a pas ce problème : avant l'hydratation il
 * ne se passe rien, et rien est la bonne réponse.
 *
 * Le titre et le thème sont ici bien que rien ne les rende interactifs : un
 * composant client est rendu par le serveur aussi, donc ils sont dans le HTML
 * prérendu comme avant. Ce qui les rejoint dans l'en-tête, c'est le seul bouton
 * qui n'appartient pas à cette moitié-là — celui des statistiques, qui sont à
 * une personne (ADR-0013).
 *
 * Tout le personnel descend d'un seul hook et rien ici ne le calcule : la
 * partie vient telle quelle du serveur, les statistiques aussi. Elles ont leur
 * propre porte mais **la file de ce hook** (ADR-0009), parce qu'une requête
 * personnelle hors de cette file est un second joueur qui se crée.
 */
export function DailyGridView({ grid }: Readonly<{ grid: DailyGrid }>) {
  const { state, open, submit, pending, stats } = useDayPlays(grid.date)
  // L'énigme ouverte, et la fenêtre en est la vue : une seule à la fois.
  const [opened, setOpened] = useState<Position | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)

  const enigma = grid.enigmas.find((candidate) => candidate.position === opened) ?? null
  const stale = isStaleGrid(state, grid.date)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">La grille du jour</h1>
          {/* Le thème qualifie la journée entière et s'annonce explicitement
              (specs §4). Texte libre, imprimé tel que l'admin l'a tapé : le
              code ne classe rien et ne corrige rien. */}
          <p className="text-neutral-600">
            Thème : <span className="font-medium text-neutral-900">{grid.theme}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setStatsOpen(true)
          }}
          className="shrink-0 cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        >
          Statistiques
        </button>
      </header>

      {stale ? <StaleGridNotice /> : null}

      <ol className="flex flex-col gap-4">
        {grid.enigmas.map((candidate) => (
          <li key={candidate.position}>
            <EnigmaCard
              enigma={candidate}
              play={playAt(state, candidate.position)}
              loading={state.status === 'loading'}
              onOpen={() => {
                setOpened(candidate.position)
                // Idempotent par position : rouvrir une énigme déjà ouverte ne
                // redemande rien, et ne crée surtout pas une seconde partie.
                open(candidate.position)
              }}
            />
          </li>
        ))}
      </ol>

      {state.status === 'unavailable' ? <UnavailableNotice /> : null}

      <EnigmaDialog
        enigma={enigma}
        play={enigma === null ? undefined : playAt(state, enigma.position)}
        loading={state.status === 'loading'}
        stale={stale}
        pending={enigma !== null && pending.has(enigma.position)}
        onClose={() => {
          // Refermer ne referme pas la partie — rien ne le fait, jusqu'à ce
          // qu'un essai la termine ou que le jour l'emporte.
          setOpened(null)
        }}
        onSubmit={(footballerId) => {
          if (enigma !== null) submit(enigma.position, footballerId)
        }}
      />

      <Modal
        open={statsOpen}
        title="Vos statistiques"
        onClose={() => {
          setStatsOpen(false)
        }}
      >
        <PlayerStatsPanel stats={stats} />
      </Modal>
    </div>
  )
}
