'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { formatGridDate, positionObject } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'
import type { PlayerStats } from '@/shared/stats'
import type { Position } from '@/shared/schedule'

import {
  ActionBand,
  GameHeader,
  GridTitle,
  PrimaryLink,
  ScreenColumn,
  ScrollBody,
} from './chrome'
import { DesktopRail } from './rail'
import { EnigmaCard } from './enigma-card'
import { useGame, useGrid } from './game-provider'
import { StaleGridNotice, UnavailableNotice } from './notices'
import { CopyResultButton } from './share-summary'
import { useCountdown } from './use-countdown'
import { useDesktop } from './use-desktop'
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
 *
 * ## Sur un grand écran, l'accueil passe la main
 *
 * L'ordinateur montre tout d'un coup : le rail liste les trois niveaux et leur
 * état, donc un sommaire qui les redit en cartes ne dit plus rien de neuf. Dès
 * que la progression est connue, l'accueil **s'efface au profit du défi à
 * reprendre** — la partie en cours s'il y en a une, sinon le premier niveau
 * jamais ouvert.
 *
 * Il s'efface en allant à l'adresse de ce niveau, et non en montrant son écran
 * sur place : c'est l'URL qui dit quel défi est ouvert, à un format d'écran
 * comme à l'autre, et c'est ce qui garde une seule définition de « où suis-je »
 * — celle que le rail surligne, que le bouton « précédent » remonte et qu'un
 * lien collé dans une conversation rouvre. Un affichage posé sur `/` aurait
 * demandé à l'accueil de retenir son choix, donc un second endroit où le niveau
 * courant est écrit, et deux façons de ne pas être d'accord.
 *
 * `replace` et non `push` : le sommaire n'est pas une étape que le bouton
 * « précédent » doit faire retraverser.
 *
 * Le prix est assumé et il est réel : arriver sur `/` avec un grand écran
 * **crée une partie** quand aucune n'est en cours (ADR-0009), et une partie
 * ouverte non terminée compte comme un échec si la grille tourne avant la fin.
 * C'est la contrepartie de « tout en une page », et c'est pourquoi le téléphone
 * garde son sommaire : deux formats, deux compromis, et un seul endroit — ici —
 * où le choix est écrit.
 */
export function HomeScreen() {
  const grid = useGrid()
  const { state, playAt } = useGame()
  const desktop = useDesktop()
  const router = useRouter()

  // `null` tant que la progression n'est pas là : le niveau à reprendre se lit
  // dans les parties du joueur, et le supposer aurait ouvert l'échauffement
  // sous le nez de quelqu'un qui en est au titulaire.
  const resume = state.status === 'ready' ? nextMove(grid.enigmas, playAt)?.position ?? null : null

  useEffect(() => {
    if (!desktop || resume === null) return

    router.replace(`/${resume}`)
  }, [desktop, resume, router])

  // La main est passée, ou elle est sur le point de l'être : le sommaire
  // disparaît du grand écran avant d'avoir été vu, plutôt que d'apparaître le
  // temps d'une requête pour être remplacé ensuite.
  const handing = desktop && (state.status === 'loading' || resume !== null)

  return (
    <>
      {/* Aucun niveau marqué : l'accueil n'en montre aucun. */}
      <DesktopRail active={null} />

      <Overview hiddenOnDesktop={handing} />

      {handing ? <Waiting /> : null}
    </>
  )
}

/** Le sommaire de la journée : l'écran du téléphone, et la grille finie. */
function Overview({ hiddenOnDesktop }: Readonly<{ hiddenOnDesktop: boolean }>) {
  const grid = useGrid()
  const { state, stats, playAt, openStats, openAccount, account } = useGame()

  return (
    <ScreenColumn hiddenOnDesktop={hiddenOnDesktop}>
      <GameHeader
        onStats={openStats}
        onAccount={openAccount}
        accountInitial={account.initial}
      >
        <GridTitle date={formatGridDate(grid.date)} theme={grid.theme} />
      </GameHeader>

      <ScrollBody>
        <div className="flex flex-col gap-[9px]">
          {state.status === 'unavailable' ? <UnavailableNotice /> : null}
          {isStaleGrid(state, grid.date) ? <StaleGridNotice /> : null}

          {/* Les trois cartes côte à côte dès qu'il y a la largeur : empilées
              sur 800 px, chacune serait un bandeau bien plus large que haut. */}
          <div className="flex flex-col gap-[9px] lg:grid lg:grid-cols-3 lg:items-start">
            {grid.enigmas.map((enigma) => (
              <EnigmaCard
                key={enigma.position}
                enigma={enigma}
                play={playAt(enigma.position)}
                loading={state.status === 'loading'}
              />
            ))}
          </div>
        </div>
      </ScrollBody>

      <ActionBand>
        <DayAction />
        <Ledger stats={stats} />
      </ActionBand>
    </ScreenColumn>
  )
}

/**
 * La zone principale de l'ordinateur, le temps que la main se passe.
 *
 * Elle ne montre pas le sommaire en attendant : ce serait la mise en page du
 * téléphone posée sur un grand écran pour une demi-seconde, puis remplacée. Le
 * rail est déjà là, lui, et il vient de la page prérendue — la date, le thème
 * et les trois niveaux sont lisibles avant la première requête.
 */
function Waiting() {
  return (
    <ScreenColumn>
      <ScrollBody>
        <p className="font-mono text-meta text-ink">Votre partie arrive…</p>
      </ScrollBody>
    </ScreenColumn>
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
  const grid = useGrid()
  const { state, playAt } = useGame()

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
