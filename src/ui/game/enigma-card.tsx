import Link from 'next/link'

import { gridLevel } from '@/shared/archive'
import type { GridBase } from '@/shared/archive'
import { describeTries } from '@/shared/play'
import { positionHeading } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'

import { ClubCrest } from './club-crest'

/**
 * Une des trois cartes de l'aperçu du jour : le niveau, son état, son parcours
 * en raccourci.
 *
 * La carte montre les blasons **avant** que l'énigme soit ouverte, et c'est
 * voulu : le parcours *est* l'énigme (CONTEXT.md), il est public, et voir sept
 * cercles au lieu de quatre est déjà une information sur la difficulté du jour.
 * Ce qu'elle ne montre pas, c'est le nom des clubs — la carte donne envie, elle
 * ne fait pas jouer.
 *
 * Un lien vers `/1`, `/2` ou `/3`, donc une URL partageable et une page
 * prérendue. La partie, elle, naît à l'arrivée sur l'écran du niveau et non au
 * clic : c'est le même instant vu du bon côté, et c'est le seul qui survit à
 * quelqu'un qui colle l'URL dans une conversation.
 *
 * `base` est d'où part ce lien, et c'est tout ce que l'archive change à cette
 * carte : la même carte, sous `/archive/<date>/2` au lieu de `/2`.
 *
 * ## Une pile sur le téléphone, une ligne sur l'ordinateur
 *
 * Les trois blocs sont les mêmes et dans le même ordre — le niveau, les
 * blasons, ce que la partie a coûté — seule leur direction change (`lg:`). Ce
 * n'est pas un goût de mise en page : le sommaire ne s'affiche sur grand écran
 * que sous un rail qui liste déjà les trois niveaux, donc les cartes y sont un
 * rappel et doivent tenir dans le regard, pas remplir la hauteur. Empilées, les
 * trois occupaient un écran entier pour redire ce que la colonne de gauche
 * disait en trois lignes.
 *
 * Le rembourrage vertical, lui, est **plus généreux** en `lg:` qu'en téléphone,
 * et ce n'est pas une contradiction : ce qui gênait était la hauteur d'une
 * carte en pile, pas celle d'une ligne. Une ligne trop fine sur 776 px de large
 * n'est plus une carte, c'est un filet — et la zone a la place de la laisser
 * respirer.
 */
export function EnigmaCard({
  enigma,
  base,
  play,
  loading,
}: Readonly<{
  enigma: Enigma
  base: GridBase
  play: EnigmaPlay | undefined
  loading: boolean
}>) {
  const current = play?.status === 'in_progress'

  return (
    <Link
      href={gridLevel(base, enigma.position)}
      className={`rounded-card flex w-full flex-col gap-[10px] bg-white px-[14px] py-[13px] text-left lg:flex-row lg:items-center lg:gap-[16px] lg:px-[18px] lg:py-[26px] ${
        // Le contour, et jamais une ombre : les maquettes n'en portent aucune,
        // l'état sélectionné se dit par un trait de 2 px.
        current ? 'ring-ink ring-2' : ''
      }`}
    >
      {/* Largeur fixe en `lg:` et non `auto` : les trois titres n'ont pas la
          même longueur, et trois pastilles qui ne tombent pas au même endroit
          font trois lignes qui ne se lisent plus comme une liste. */}
      <div className="flex items-center justify-between gap-[10px] lg:w-[210px] lg:shrink-0">
        <span className="font-display text-card">{positionHeading(enigma.position)}</span>
        <StatusBadge play={play} loading={loading} />
      </div>

      {/* Décorative en bloc : les blasons ne portent aucun nom ici, et ce que
          la carte annonce vraiment — le nombre de clubs — est écrit dessous. */}
      <div aria-hidden className="flex flex-wrap gap-[6px] lg:min-w-0 lg:flex-1">
        {enigma.passages.map((passage, index) => (
          <ClubCrest
            key={index}
            clubName={passage.clubName}
            crestKey={passage.crestKey}
            size={28}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-[10px] lg:shrink-0 lg:gap-[14px]">
        <span className="font-mono text-meta text-ink/55">
          {clubCount(enigma.passages.length)}
          {/* Tant que la partie n'est pas revenue du serveur, la carte ne dit
              rien des essais plutôt que d'annoncer une dotation intacte : six
              essais affichés puis remplacés par « 3 restants » se lit comme une
              perte. */}
          {loading ? '' : ` · ${describeTries(play)}`}
        </span>
        <span className="font-mono text-cta text-ink">{invitation(play)} ›</span>
      </div>
    </Link>
  )
}

function StatusBadge({
  play,
  loading,
}: Readonly<{ play: EnigmaPlay | undefined; loading: boolean }>) {
  const { label, tone } = badge(play, loading)

  return (
    <span className={`font-mono text-badge shrink-0 rounded-full px-2 py-1 ${tone}`}>
      {label}
    </span>
  )
}

function badge(
  play: EnigmaPlay | undefined,
  loading: boolean,
): { label: string; tone: string } {
  if (play === undefined) {
    return { label: loading ? '…' : 'À JOUER', tone: 'bg-crest text-ink/60' }
  }

  switch (play.status) {
    case 'in_progress':
      return { label: 'EN COURS', tone: 'bg-ink text-white' }
    case 'solved':
      return { label: 'TROUVÉ', tone: 'bg-found-soft text-found-ink' }
    case 'failed':
      return { label: 'ÉCHOUÉ', tone: 'bg-missed-soft text-missed' }
  }
}

function invitation(play: EnigmaPlay | undefined): string {
  if (play === undefined) return 'JOUER'

  return play.status === 'in_progress' ? 'REPRENDRE' : 'REVOIR'
}

const clubCount = (clubs: number) => (clubs === 1 ? '1 club' : `${clubs} clubs`)
