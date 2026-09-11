'use client'

import { formatGridDate, positionObject } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { PlayerStats } from '@/shared/stats'
import type { Position } from '@/shared/schedule'

import { ActionBand, GameHeader, GridTitle, PrimaryLink, ScrollBody } from './chrome'
import { EnigmaCard } from './enigma-card'
import { useGame } from './game-provider'
import { StaleGridNotice, UnavailableNotice } from './notices'
import { CopyResultButton } from './share-summary'
import { useCountdown } from './use-countdown'
import { isStaleGrid, playsOf } from './use-day-plays'

/**
 * L'accueil du jour : les trois niveaux, leur état, et l'invitation à reprendre
 * celui qui est en cours.
 *
 * Les trois cartes sont là d'emblée et aucune n'est ouverte : bloquer sur
 * l'échauffement ne doit pas coûter le reste de la journée (specs §2), et une
 * énigme ouverte d'office créerait une partie à chaque arrivée sur la page —
 * partie que le changement de grille lirait ensuite comme un échec. Ouvrir est
 * un geste, et le geste est ici un lien vers `/1`, `/2` ou `/3`.
 */
export function HomeScreen() {
  const { grid, state, stats, playAt, openStats } = useGame()

  return (
    <>
      <GameHeader onStats={openStats}>
        <GridTitle date={formatGridDate(grid.date)} theme={grid.theme} />
      </GameHeader>

      <ScrollBody>
        <div className="flex flex-col gap-[9px]">
          {state.status === 'unavailable' ? <UnavailableNotice /> : null}
          {isStaleGrid(state, grid.date) ? <StaleGridNotice /> : null}

          {grid.enigmas.map((enigma) => (
            <EnigmaCard
              key={enigma.position}
              enigma={enigma}
              play={playAt(enigma.position)}
              loading={state.status === 'loading'}
            />
          ))}
        </div>
      </ScrollBody>

      <ActionBand>
        <DayAction />
        <Ledger stats={stats} />
      </ActionBand>
    </>
  )
}

/**
 * Le bouton du bandeau, qui n'a pas de libellé fixe : il nomme le geste
 * suivant.
 *
 * Une partie en cours passe devant une énigme jamais ouverte, quelle que soit
 * leur position — le joueur revient pour finir ce qu'il a commencé, pas pour
 * respecter l'ordre de difficulté. Quand les trois sont finies il n'y a plus de
 * geste de jeu, et le bandeau propose alors ce qui reste : copier le résultat.
 */
function DayAction() {
  const { grid, state, playAt } = useGame()

  // Tant que la progression n'est pas là, le libellé serait une supposition :
  // annoncer « Jouer l'échauffement » puis le remplacer par « Reprendre le
  // titulaire » ferait bouger le bouton sous le pouce.
  if (state.status === 'loading') return <PrimaryLink label="Jouer la grille du jour" href="/1" />

  const move = nextMove(grid.enigmas, playAt)

  if (move === null) {
    return (
      <CopyResultButton
        source={{ date: grid.date, theme: grid.theme, plays: playsOf(state) }}
      />
    )
  }

  return (
    <PrimaryLink
      label={`${move.verb} ${positionObject(move.position)}`}
      href={`/${move.position}`}
    />
  )
}

function nextMove(
  enigmas: readonly Enigma[],
  playAt: (position: Position) => EnigmaPlay | undefined,
): { position: Position; verb: string } | null {
  const resumable = enigmas.find((e) => playAt(e.position)?.status === 'in_progress')
  if (resumable !== undefined) return { position: resumable.position, verb: 'Reprendre' }

  const untouched = enigmas.find((e) => playAt(e.position) === undefined)
  if (untouched !== undefined) return { position: untouched.position, verb: 'Jouer' }

  return null
}

/**
 * Les deux lignes sous le bouton : ce que la journée vaut, et quand la
 * prochaine arrive.
 *
 * La série et les cartons pleins n'apparaissent qu'une fois arrivés. Une série
 * affichée à zéro le temps de la requête serait lue comme une série perdue, et
 * c'est précisément le chiffre auquel un joueur tient.
 */
function Ledger({ stats }: Readonly<{ stats: PlayerStats | null | undefined }>) {
  const countdown = useCountdown()

  return (
    <div className="flex flex-col gap-[3px]">
      {stats === undefined || stats === null ? null : (
        <span className="font-mono text-meta text-ink">
          Série {stats.serie} · {stats.perfectChallenges} carton
          {stats.perfectChallenges > 1 ? 's' : ''} plein
          {stats.perfectChallenges > 1 ? 's' : ''}
        </span>
      )}

      {countdown === null ? null : (
        <span className="font-mono text-meta text-ink/70">Nouvelle grille dans {countdown}</span>
      )}
    </div>
  )
}
