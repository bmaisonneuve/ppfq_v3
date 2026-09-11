'use client'

import { describePlay } from '@/shared/play'
import { positionHeading } from '@/shared/schedule'
import type { Enigma } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'

import { ClubCrest } from './club-crest'

/**
 * Une énigme vue de la grille : ce qu'elle est, où le joueur en est, et rien
 * de plus.
 *
 * La carte est un bouton — l'énigme s'ouvre dans une fenêtre, elle ne se
 * déplie pas sous la carte. La différence n'est pas décorative : ouvrir une
 * énigme, c'est créer la partie (`docs/modele-donnees.md` §4), et un geste qui
 * porte cette conséquence doit se voir comme un geste. Les trois cartes sont
 * là dès le premier regard et aucune n'attend qu'une autre soit trouvée
 * (specs §2) ; aucune n'est ouverte non plus, donc une arrivée sur la page ne
 * compte plus pour une personne exposée à l'échauffement.
 *
 * Le nombre de clubs et les blasons sont sur la carte parce qu'ils sont publics
 * par construction — le parcours est montré entier — et parce qu'une carte qui
 * n'annonce rien est une carte qu'on n'ouvre pas. La bande de blasons est ce
 * qui distingue les trois énigmes du jour d'un coup d'œil, avant même d'en lire
 * une seule.
 *
 * L'état de la partie est ici et seulement ici : c'est ce qui fait qu'un
 * rechargement montre d'un regard où le joueur en a laissé les trois, sans en
 * ouvrir aucune et donc sans créer une seule partie.
 */
export function EnigmaCard({
  enigma,
  play,
  loading,
  onOpen,
}: Readonly<{
  enigma: Enigma
  /** Undefined tant que la requête personnelle n'a pas répondu, ou jamais ouverte. */
  play: EnigmaPlay | undefined
  loading: boolean
  onOpen: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full cursor-pointer flex-col gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-5 text-left shadow-sm transition hover:border-neutral-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          {positionHeading(enigma.position)}
        </span>
        <Partie play={play} loading={loading} />
      </div>

      {/* Décorative en bloc : les blasons ne portent aucun nom ici, et ce que
          la carte annonce vraiment — le nombre de clubs — est écrit dessous. */}
      <div aria-hidden className="flex flex-wrap items-center gap-2">
        {enigma.passages.map((passage, index) => (
          // L'index comme clé, pour la raison donnée dans `enigma-dialog.tsx`.
          <ClubCrest key={index} crestKey={passage.crestKey} className="size-9" />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-neutral-500">{clubCount(enigma.passages.length)}</span>
        <span className="text-sm font-medium text-neutral-900 group-hover:underline">
          {invitation(play)}
        </span>
      </div>
    </button>
  )
}

/**
 * La partie, ou ce qui en tient lieu.
 *
 * Pendant la requête, trois points discrets plutôt qu'un squelette qui saute :
 * la carte est déjà entièrement lisible sans. Une fois la réponse là et
 * toujours pas de partie, il n'y a rien à dire — le joueur n'a jamais ouvert
 * celle-là, ce que l'absence de ligne enregistre exactement.
 */
function Partie({
  play,
  loading,
}: Readonly<{ play: EnigmaPlay | undefined; loading: boolean }>) {
  if (play !== undefined) {
    return <span className="text-sm font-medium text-neutral-700">{describePlay(play)}</span>
  }
  if (loading) return <span className="text-sm text-neutral-400">…</span>

  return null
}

/** Ce que le clic promet, qui n'est pas le même mot selon ce qui attend derrière. */
function invitation(play: EnigmaPlay | undefined): string {
  if (play === undefined) return 'Jouer'
  return play.status === 'in_progress' ? 'Reprendre' : 'Revoir'
}

const clubCount = (clubs: number) => (clubs === 1 ? '1 club' : `${clubs} clubs`)
