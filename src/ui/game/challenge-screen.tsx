'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { isOver } from '@/shared/play'
import { positionObject, positionTitle } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay, HintTier, RevealedHint } from '@/shared/play'
import type { FootballerSuggestion } from '@/shared/search'
import type { Position } from '@/shared/schedule'

import {
  ActionBand,
  GameHeader,
  PrimaryLink,
  ScreenColumn,
  ScrollBody,
  TextLink,
} from './chrome'
import { AnswerCard } from './answer-card'
import { ClubTable } from './club-table'
import { Confetti } from './confetti'
import { DesktopRail } from './rail'
import { EssaiBand } from './essai-band'
import { useGame, useGrid } from './game-provider'
import { StaleGridNotice, UnavailableNotice } from './notices'
import { SegmentIcon } from './segment-icon'
import { isStaleGrid } from './use-day-plays'
import { VerdictAnnounce, VerdictBand, closes, useLive, verdictAt } from './verdict'
import type { Verdict } from './verdict'

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
  const grid = useGrid()
  const { state, pending, playAt, open, submit, verdict, openStats, openAccount, account } =
    useGame()

  useEffect(() => {
    // Idempotent par position : revenir sur un niveau déjà ouvert ne redemande
    // rien, et ne crée surtout pas une seconde partie.
    open(position)
  }, [open, position])

  const enigma = grid.enigmas.find((candidate) => candidate.position === position)
  const play = enigma === undefined ? undefined : playAt(position)

  /**
   * Le verdict de cet écran-ci, et l'instant de cet écran-ci.
   *
   * Deux filtres et non un. La **position** d'abord : le verdict vit dans le
   * layout, donc l'écran du titulaire le voit passer même quand il concerne
   * l'échauffement. La **fraîcheur** ensuite : la bande qui nomme l'indice
   * reste jusqu'à l'essai suivant — on peut y revenir — tandis que la secousse,
   * la ola et la gerbe n'ont lieu qu'une fois (`verdict.tsx`).
   */
  const ownVerdict = verdictAt(verdict, position)
  const liveVerdict = useLive(ownVerdict)
  const hints = play?.hints ?? []

  // Une grille à deux énigmes est une grille incomplète, pas un écran à
  // inventer : le back-office en programme toujours trois (specs §2).
  if (enigma === undefined) return <MissingEnigma />

  return (
    <>
      <Celebration verdict={liveVerdict} />

      {/* Le rail n'est pas un écran à part : c'est le même niveau, avec la
          place d'afficher la journée à côté. Il marque celui-ci. */}
      <DesktopRail active={position} />

      <ScreenColumn>
        <GameHeader
          onStats={openStats}
          onAccount={openAccount}
          accountInitial={account.initial}
        >
          <SegmentedBar
            enigmas={grid.enigmas}
            active={position}
            playAt={playAt}
            popAt={closes(liveVerdict) ? position : null}
          />
        </GameHeader>

        <ScrollBody>
          <div className="flex flex-col gap-3 lg:gap-[14px]">
            {state.status === 'unavailable' ? <UnavailableNotice /> : null}

            {play !== undefined && isOver(play) ? (
              <AnswerCard play={play} clubs={enigma.passages.length} verdict={liveVerdict} />
            ) : null}

            <HintChips hints={hints} revealed={liveVerdict?.tier ?? null} />

            <ClubTable passages={enigma.passages} hints={hints} verdict={liveVerdict} />
          </div>
        </ScrollBody>

        <ActionBand>
          {/* L'animation *est* le message ; celle-ci le redit en une phrase,
              pour qui ne la voit pas. Toujours montée, jamais visible. */}
          <VerdictAnnounce verdict={ownVerdict} />

          {isStaleGrid(state, grid.date) ? (
            <StaleGridNotice />
          ) : (
            <>
              <VerdictBand verdict={ownVerdict} />

              <Band
                enigma={enigma}
                play={play}
                loading={state.status === 'loading'}
                pending={pending.has(position)}
                verdict={liveVerdict}
                onSubmit={(proposal) => {
                  submit(position, proposal)
                }}
              />
            </>
          )}
        </ActionBand>
      </ScreenColumn>
    </>
  )
}

/**
 * La gerbe, quand c'est une réussite, et rien du tout sinon.
 *
 * Montée par l'écran et pas par la carte réponse : elle est posée sur la
 * fenêtre entière, ce qu'un enfant de la zone qui défile ne peut pas être — et
 * ce qu'un enfant de la carte ne pourrait pas être non plus, la carte étant
 * justement en train de se poser (`verdict.tsx`).
 */
function Celebration({ verdict }: Readonly<{ verdict: Verdict | null }>) {
  if (verdict?.kind !== 'solved') return null

  return <Confetti double={verdict.triesUsed === 1} />
}

/**
 * La barre segmentée : trois traits, trois noms, une icône d'état.
 *
 * Elle remplace la date en tête d'écran plutôt que de s'ajouter dessous : sur
 * un téléphone, la place gagnée est une ligne de clubs de plus au premier coup
 * d'œil. Sur un grand écran elle n'a pas lieu d'être — le rail dit la même
 * chose en plus long, et l'en-tête entier disparaît avec elle (`chrome.tsx`).
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
  /** Le niveau dont l'issue vient de tomber, s'il y en a un. */
  popAt,
}: Readonly<{
  enigmas: readonly Enigma[]
  active: Position
  playAt: (position: Position) => EnigmaPlay | undefined
  popAt: Position | null
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
              <SegmentIcon play={playAt(enigma.position)} pop={enigma.position === popAt} />
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
function HintChips({
  hints,
  /** Le palier que le dernier essai vient de payer, s'il est de ceux-ci. */
  revealed,
}: Readonly<{ hints: readonly RevealedHint[]; revealed: HintTier | null }>) {
  const chips = hints.flatMap(chipOf)

  const box = useRef<HTMLDivElement>(null)
  // Les pastilles sont en haut du corps qui défile, et un parcours de huit
  // clubs les pousse hors de l'écran : une pastille qui apparaît là où le
  // joueur ne regarde pas n'est pas un indice, c'est un indice perdu.
  const arriving = chips.some((chip) => chip.tier === revealed)

  useEffect(() => {
    if (!arriving) return

    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [arriving])

  if (chips.length === 0) return null

  return (
    <div ref={box} className="flex flex-wrap gap-[6px]">
      {chips.map((chip) => (
        <span
          key={chip.tier}
          className={`font-mono text-chip text-ink rounded-full bg-white px-[10px] py-[6px] uppercase ${
            chip.tier === revealed ? 'animate-chip' : ''
          }`}
        >
          {chip.text}
        </span>
      ))}
    </div>
  )
}

/**
 * L'indice qui tient dans une pastille, ou rien du tout.
 *
 * Le palier est lu **sur l'indice**, jamais réécrit à côté de lui : c'est
 * `shared/play.ts` qui décide que la décennie est le palier 1 et la nationalité
 * le palier 3, et un `tier: 1` recopié ici en aurait fait une paire libre de
 * diverger — le jour où l'échelle bouge, l'animation se poserait sur la
 * mauvaise pastille sans que rien ne le signale.
 *
 * Une liste et non un `RevealedHint | null`, pour que `flatMap` fasse le tri :
 * les trois paliers qui sont des colonnes du tableau rendent la liste vide.
 */
function chipOf(hint: RevealedHint): { tier: HintTier; text: string }[] {
  switch (hint.tier) {
    case 1:
      return [
        {
          tier: hint.tier,
          text: hint.decade === null ? 'décennie inconnue' : `années ${hint.decade}`,
        },
      ]
    case 3:
      return [
        {
          tier: hint.tier,
          text: hint.nationality === null ? 'nationalité inconnue' : hint.nationality.frName,
        },
      ]
    // Les trois autres paliers sont des colonnes du tableau, pas des
    // pastilles. Énumérés plutôt que laissés à un `default` : c'est
    // l'exhaustivité qui ramènera ici le jour où l'échelle gagne un palier,
    // au lieu de le faire disparaître en silence.
    case 2:
    case 4:
    case 5:
      return []
  }
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
  verdict,
  onSubmit,
}: Readonly<{
  enigma: Enigma
  play: EnigmaPlay | undefined
  loading: boolean
  pending: boolean
  /** Le dernier essai, tant qu'il est un instant (`verdict.tsx`). */
  verdict: Verdict | null
  onSubmit: (proposal: FootballerSuggestion | null) => void
}>) {
  const grid = useGrid()
  const { playAt } = useGame()

  if (play === undefined) {
    return (
      <p className="font-mono text-meta text-ink/70">
        {loading ? 'Votre partie arrive…' : 'Partie indisponible.'}
      </p>
    )
  }

  if (!isOver(play)) {
    return <EssaiBand play={play} pending={pending} verdict={verdict} onSubmit={onSubmit} />
  }

  const next = grid.enigmas.find((candidate) => {
    if (candidate.position === enigma.position) return false
    const other = playAt(candidate.position)

    return other === undefined || !isOver(other)
  })

  return (
    // Le geste suivant arrive **après** la récompense, et pas pendant : un
    // bouton présent pendant la fête transforme la fête en couloir. Le délai
    // est dans `animate-rise` ; les écarts sont ceux du bandeau, pour que la
    // division n'en change aucun.
    <div className={`flex flex-col gap-2 lg:gap-[9px] ${closes(verdict) ? 'animate-rise' : ''}`}>
      {next === undefined ? (
        <PrimaryLink label="Voir la grille du jour" href="/" />
      ) : (
        <PrimaryLink label={`Ouvrir ${positionObject(next.position)} ›`} href={`/${next.position}`} />
      )}

      {/* Masqué sur grand écran : la grille du jour y est déjà en permanence
          dans le rail, et `/` y rouvrirait le défi à reprendre. « Voir la
          grille du jour » ci-dessus n'a pas ce problème — il n'apparaît que
          lorsque les trois niveaux sont finis, donc qu'il n'y a plus rien à
          reprendre. */}
      <TextLink label="Revenir à la grille" href="/" hiddenOnDesktop />
    </div>
  )
}

function MissingEnigma() {
  const { openStats, openAccount, account } = useGame()

  return (
    <>
      {/* Aucun niveau marqué : celui qu'on demandait n'est pas dans la grille,
          donc il n'est pas non plus dans le rail. */}
      <DesktopRail active={null} />

      <ScreenColumn>
        <GameHeader
          onStats={openStats}
          onAccount={openAccount}
          accountInitial={account.initial}
        />
        <ScrollBody>
          <p className="rounded-row font-mono text-meta text-ink bg-white px-[14px] py-[11px]">
            Ce niveau n’existe pas dans la grille du jour.
          </p>
        </ScrollBody>
      </ScreenColumn>
    </>
  )
}
