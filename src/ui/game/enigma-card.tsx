import Link from 'next/link'

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
 */
export function EnigmaCard({
  enigma,
  play,
  loading,
}: Readonly<{
  enigma: Enigma
  play: EnigmaPlay | undefined
  loading: boolean
}>) {
  const current = play?.status === 'in_progress'

  return (
    <Link
      href={`/${enigma.position}`}
      className={`rounded-card flex w-full flex-col gap-[10px] bg-white px-[14px] py-[13px] text-left ${
        // Le contour, et jamais une ombre : les maquettes n'en portent aucune,
        // l'état sélectionné se dit par un trait de 2 px.
        current ? 'ring-ink ring-2' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-[10px]">
        <span className="font-display text-card">{positionHeading(enigma.position)}</span>
        <StatusBadge play={play} loading={loading} />
      </div>

      {/* Décorative en bloc : les blasons ne portent aucun nom ici, et ce que
          la carte annonce vraiment — le nombre de clubs — est écrit dessous. */}
      <div aria-hidden className="flex flex-wrap gap-[6px]">
        {enigma.passages.map((passage, index) => (
          <ClubCrest
            key={index}
            clubName={passage.clubName}
            crestKey={passage.crestKey}
            size={28}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-[10px]">
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
