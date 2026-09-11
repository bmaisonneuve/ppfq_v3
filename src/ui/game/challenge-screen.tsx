'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { isOver, revealedDecade, revealedNationality } from '@/shared/play'
import { positionObject, positionTitle } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay, RevealedHint } from '@/shared/play'
import type { Position } from '@/shared/schedule'

import { ActionBand, GameHeader, PrimaryLink, ScrollBody, TextLink } from './chrome'
import { AnswerCard } from './answer-card'
import { ClubTable } from './club-table'
import { EssaiBand } from './essai-band'
import { useGame } from './game-provider'
import { StaleGridNotice, UnavailableNotice } from './notices'
import { SegmentIcon } from './segment-icon'
import { isStaleGrid } from './use-day-plays'

/**
 * Le détail d'un niveau : le parcours à lire, les indices déjà dévoilés, et
 * l'essai.
 *
 * Un écran à part entière avec sa propre URL — `/1`, `/2`, `/3` — et non une
 * fenêtre par-dessus la grille. Trois conséquences, dans l'ordre où elles
 * comptent : l'adresse se partage et se met en favori ; le bouton « précédent »
 * du navigateur ramène à la journée ; la barre segmentée passe d'un niveau à
 * l'autre sans repasser par l'accueil, ce qu'une fenêtre modale interdit — elle
 * se ferme pour se rouvrir.
 *
 * Ce que la fenêtre garantissait est conservé : ouvrir un niveau crée la partie
 * (ADR-0009). C'est simplement l'arrivée sur l'écran qui la demande, et non le
 * clic — sinon une URL collée dans une conversation ouvrirait une énigme sans
 * jamais créer de partie.
 */
export function ChallengeScreen({ position }: Readonly<{ position: Position }>) {
  const { grid, state, pending, playAt, open, submit, openStats } = useGame()

  useEffect(() => {
    // Idempotent par position : revenir sur un niveau déjà ouvert ne redemande
    // rien, et ne crée surtout pas une seconde partie.
    open(position)
  }, [open, position])

  const enigma = grid.enigmas.find((candidate) => candidate.position === position)
  const play = enigma === undefined ? undefined : playAt(position)

  // Une grille à deux énigmes est une grille incomplète, pas un écran à
  // inventer : le back-office en programme toujours trois (specs §2).
  if (enigma === undefined) return <MissingEnigma />

  return (
    <>
      <GameHeader onStats={openStats}>
        <SegmentedBar enigmas={grid.enigmas} active={position} playAt={playAt} />
      </GameHeader>

      <ScrollBody>
        <div className="flex flex-col gap-3">
          {state.status === 'unavailable' ? <UnavailableNotice /> : null}

          {play !== undefined && isOver(play) ? (
            <AnswerCard play={play} clubs={enigma.passages.length} />
          ) : null}

          <HintChips hints={play?.hints ?? []} />

          <ClubTable passages={enigma.passages} hints={play?.hints ?? []} />
        </div>
      </ScrollBody>

      <ActionBand>
        {isStaleGrid(state, grid.date) ? (
          <StaleGridNotice />
        ) : (
          <Band
            enigma={enigma}
            play={play}
            loading={state.status === 'loading'}
            pending={pending.has(position)}
            onSubmit={(footballerId) => {
              submit(position, footballerId)
            }}
          />
        )}
      </ActionBand>
    </>
  )
}

/**
 * La barre segmentée : trois traits, trois noms, une icône d'état.
 *
 * Elle remplace la date en tête d'écran plutôt que de s'ajouter dessous : sur
 * un téléphone, la place gagnée est une ligne de clubs de plus au premier coup
 * d'œil.
 *
 * Le trait noir marque **le niveau affiché**, et lui seul. C'est ce qui sépare
 * les deux questions que la barre doit répondre d'un regard : *où suis-je* — le
 * trait — et *où en sont les autres* — l'icône. Un trait qui aurait aussi dit
 * « terminé » aurait laissé le joueur compter les segments pour se situer.
 */
function SegmentedBar({
  enigmas,
  active,
  playAt,
}: Readonly<{
  enigmas: readonly Enigma[]
  active: Position
  playAt: (position: Position) => EnigmaPlay | undefined
}>) {
  return (
    <nav className="flex gap-[5px]">
      {enigmas.map((enigma) => {
        const here = enigma.position === active

        return (
          <Link
            key={enigma.position}
            href={`/${enigma.position}`}
            aria-current={here ? 'page' : undefined}
            className="flex flex-1 flex-col items-stretch gap-[6px]"
          >
            <span className={`rounded-bar h-[5px] ${here ? 'bg-ink' : 'bg-white/40'}`} />
            <span className="flex items-center gap-[5px]">
              <SegmentIcon play={playAt(enigma.position)} />
              <span
                className={`font-display text-segment truncate ${
                  here ? 'text-ink' : 'text-ink/65'
                }`}
              >
                {positionTitle(enigma.position)}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Les indices qui ne tiennent pas dans une colonne : la décennie, la
 * nationalité.
 *
 * Un palier atteint dont la donnée manque s'affiche quand même, et le dit. Le
 * joueur a payé un essai pour ce palier ; ne rien montrer lui laisserait croire
 * que l'écran est cassé, et « inconnue » est au moins une information sur le
 * catalogue.
 */
function HintChips({ hints }: Readonly<{ hints: readonly RevealedHint[] }>) {
  const decade = revealedDecade(hints)
  const nationality = revealedNationality(hints)

  const chips = [
    ...(decade === undefined ? [] : [decade === null ? 'décennie inconnue' : `années ${decade}`]),
    ...(nationality === undefined
      ? []
      : [nationality === null ? 'nationalité inconnue' : nationality.frName]),
  ]

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-[6px]">
      {chips.map((chip) => (
        <span
          key={chip}
          className="font-mono text-chip text-ink rounded-full bg-white px-[10px] py-[6px] uppercase"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

/**
 * Le contenu du bandeau : on joue, ou la partie est finie et l'écran propose la
 * suite.
 */
function Band({
  enigma,
  play,
  loading,
  pending,
  onSubmit,
}: Readonly<{
  enigma: Enigma
  play: EnigmaPlay | undefined
  loading: boolean
  pending: boolean
  onSubmit: (footballerId: string | null) => void
}>) {
  const { grid, playAt } = useGame()

  if (play === undefined) {
    return (
      <p className="font-mono text-meta text-ink/70">
        {loading ? 'Votre partie arrive…' : 'Partie indisponible.'}
      </p>
    )
  }

  if (!isOver(play)) return <EssaiBand play={play} pending={pending} onSubmit={onSubmit} />

  const next = grid.enigmas.find((candidate) => {
    if (candidate.position === enigma.position) return false
    const other = playAt(candidate.position)

    return other === undefined || !isOver(other)
  })

  return (
    <>
      {next === undefined ? (
        <PrimaryLink label="Voir la grille du jour" href="/" />
      ) : (
        <PrimaryLink label={`Ouvrir ${positionObject(next.position)} ›`} href={`/${next.position}`} />
      )}

      <TextLink label="Revenir à la grille" href="/" />
    </>
  )
}

function MissingEnigma() {
  const { openStats } = useGame()

  return (
    <>
      <GameHeader onStats={openStats} />
      <ScrollBody>
        <p className="rounded-row font-mono text-meta text-ink bg-white px-[14px] py-[11px]">
          Ce niveau n’existe pas dans la grille du jour.
        </p>
      </ScrollBody>
    </>
  )
}
