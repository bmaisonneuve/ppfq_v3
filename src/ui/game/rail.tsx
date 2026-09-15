'use client'

import Link from 'next/link'

import { describePlay, describeTries } from '@/shared/play'
import { formatGridDate, positionTitle } from '@/shared/schedule'
import { successRatePercent } from '@/shared/stats'
import type { EnigmaPlay } from '@/shared/play'
import type { PlayerStats } from '@/shared/stats'
import type { Position } from '@/shared/schedule'

import { BrandRow, GridTitle } from './chrome'
import { closes, useLive } from './verdict'
import type { Verdict } from './verdict'
import { SegmentIcon } from './segment-icon'
import { useGame } from './game-provider'

/**
 * Le rail de l'ordinateur (`1c` du handoff) : la marque, la journée, les trois
 * niveaux, et les chiffres du joueur en bas.
 *
 * C'est le même écran que sur le téléphone, à qui la largeur permet de montrer
 * d'un coup ce que le téléphone montre en deux temps : sur un petit écran, la
 * grille du jour est une page (`/`) et le niveau en est une autre (`/1`) ;
 * ici les deux tiennent côte à côte, et « naviguer entre les trois défis » est
 * un regard plutôt qu'un aller-retour.
 *
 * Il ne remplace pourtant pas le routage : chaque ligne est un `<Link>` vers
 * `/1`, `/2` ou `/3`. L'adresse reste donc partageable et prérendue, et comme
 * le layout du jeu ne se remonte pas d'une navigation à l'autre, passer d'un
 * niveau au suivant ne redemande rien au serveur — l'écran change, la
 * progression déjà chargée reste. Un état local à la place aurait coûté les
 * trois URL pour ne rien gagner de visible.
 *
 * `hidden lg:flex` : le rail n'existe pas sous 1024 px, où la barre segmentée
 * de l'en-tête fait le même travail dans une ligne (`challenge-screen.tsx`).
 *
 * `active` est passé par l'écran et non déduit de l'adresse, parce que
 * l'accueil de l'ordinateur ouvre un défi sans changer d'URL : lui seul sait
 * lequel il montre.
 */
export function DesktopRail({ active }: Readonly<{ active: Position | null }>) {
  const { grid, state, stats, playAt, verdict, openStats, openAccount, account } = useGame()

  // Le niveau dont l'issue vient de tomber. Sur un grand écran, la barre
  // segmentée n'existe pas : c'est ici, et nulle part ailleurs, que le joueur
  // voit un niveau se fermer pendant qu'il lit sa carte réponse.
  const closing = closedBy(useLive(verdict))

  return (
    <aside className="bg-band hidden flex-col gap-[18px] overflow-y-auto px-[18px] pt-[18px] pb-[20px] lg:flex">
      <BrandRow
        onStats={openStats}
        onAccount={openAccount}
        accountInitial={account.initial}
      />

      {/* Le jour sans grille garde son rail : ce qu'il porte — le compte, la
          série — n'appartient pas à la journée (`no-grid.tsx`). Ce qui manque
          manque, et rien n'est inventé pour combler le trou. */}
      {grid === null ? null : (
        <>
          <GridTitle date={formatGridDate(grid.date)} theme={grid.theme} stacked />

          <div className="flex flex-col gap-[7px]">
            <h2 className="font-mono text-column text-ink">LA GRILLE DU JOUR</h2>

            <nav aria-label="Les trois niveaux du jour" className="flex flex-col gap-[7px]">
              {grid.enigmas.map((enigma) => (
                <RailLink
                  key={enigma.position}
                  position={enigma.position}
                  play={playAt(enigma.position)}
                  loading={state.status === 'loading'}
                  here={enigma.position === active}
                  pop={enigma.position === closing}
                />
              ))}
            </nav>
          </div>
        </>
      )}

      <RailStats stats={stats} />
    </aside>
  )
}

/** Le niveau que cet essai vient de fermer, s'il en a fermé un. */
function closedBy(verdict: Verdict | null): Position | null {
  return verdict !== null && closes(verdict) ? verdict.position : null
}

/**
 * Une ligne du rail : l'état du niveau, son nom, où il en est.
 *
 * L'icône est celle de la barre segmentée du téléphone, et c'est voulu : les
 * deux formats répondent à la même question — *où en sont les autres* — et une
 * coche verte ici et un rond vert là auraient fait deux vocabulaires. La
 * maquette peint en vert la pastille du niveau **affiché** ; le contour de 2 px
 * le dit déjà, et l'icône est alors libre de ne parler que de l'issue.
 */
function RailLink({
  position,
  play,
  loading,
  here,
  pop,
}: Readonly<{
  position: Position
  play: EnigmaPlay | undefined
  loading: boolean
  here: boolean
  pop: boolean
}>) {
  return (
    <Link
      href={`/${position}`}
      aria-current={here ? 'page' : undefined}
      className={`rounded-rail flex items-center gap-[10px] bg-white px-[12px] py-[11px] ${
        // Le contour, et jamais une ombre : les maquettes n'en portent aucune.
        here ? 'ring-ink ring-2' : ''
      }`}
    >
      <SegmentIcon play={play} pop={pop} />

      <span className="flex min-w-0 flex-col items-start gap-[3px]">
        <span className="font-display text-rail text-ink">{positionTitle(position)}</span>
        {/* Tant que la progression n'est pas là, la ligne ne dit pas « Pas
            commencé » : ce serait faux pour le joueur qui revient au milieu de
            sa journée, et c'est précisément lui qui lit ce rail. */}
        <span className="font-mono text-sub text-ink/60">
          {loading ? '…' : railMeta(play)}
        </span>
      </span>
    </Link>
  )
}

/**
 * Ce qu'une ligne du rail dit sous le nom du niveau.
 *
 * Trois phrases empruntées au vocabulaire partagé, plus une qui n'existe que
 * là : une énigme jamais ouverte n'a pas de partie, donc rien à décrire.
 * Pendant la partie c'est `describeTries` — ce qui **reste** est le chiffre qui
 * intéresse quelqu'un qui choisit où revenir — et une fois l'issue tombée,
 * `describePlay`, qui ne compte pas les essais d'un échec.
 */
function railMeta(play: EnigmaPlay | undefined): string {
  if (play === undefined) return 'Pas commencé'

  return play.status === 'in_progress' ? describeTries(play) : describePlay(play)
}

/**
 * Les trois chiffres du bas du rail.
 *
 * `mt-auto` : ils sont collés au bord inférieur, quel que soit le nombre de
 * niveaux au-dessus. Ils ne s'affichent pas avant d'être lus — une série à zéro
 * le temps d'une requête se lit comme une série perdue, et c'est le chiffre
 * auquel un joueur tient.
 */
function RailStats({ stats }: Readonly<{ stats: PlayerStats | null | undefined }>) {
  if (stats === undefined || stats === null) return null

  const rate = successRatePercent(stats)

  return (
    <dl className="font-mono text-meta text-ink mt-auto flex flex-col gap-[7px]">
      <StatLine label="Série" value={days(stats.serie)} />
      <StatLine label="Cartons pleins" value={String(stats.perfectChallenges)} />
      {/* Zéro sur zéro n'est pas un taux : `successRatePercent` répond `null`
          pour un joueur qui n'a rien joué, et la ligne disparaît. */}
      {rate === null ? null : <StatLine label="Réussite" value={`${rate} %`} />}
    </dl>
  )
}

function StatLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Français, donc zéro au singulier : « 0 jour », « 1 jour », « 2 jours ». */
const days = (count: number) => `${count} jour${count > 1 ? 's' : ''}`
