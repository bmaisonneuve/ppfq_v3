'use client'

import { positionHeading } from '@/shared/schedule'
import type { Enigma, EnigmaPassage } from '@/shared/grid'
import type { EnigmaPlay } from '@/shared/play'

import { ClubCrest } from './club-crest'
import { EnigmaEssai } from './enigma-essai'
import { Modal } from './modal'
import { StaleGridNotice, UnavailableNotice } from './notices'

/**
 * L'énigme ouverte : le parcours, puis l'essai.
 *
 * Une fenêtre plutôt qu'un dépliant sous la carte, et ce n'est pas qu'une
 * question de place. Ce qui se joue là — six essais, cinq indices qui se
 * dévoilent, une réponse au bout — demande l'écran entier d'un téléphone, et
 * une énigme jouée à côté des deux autres est une énigme dont on lit les
 * indices en cherchant où ils s'arrêtent.
 *
 * Le parcours en premier parce que le parcours *est* la question (specs §3).
 * Il ne coûte aucune requête : il voyage dans la page prérendue (ADR-0008), ce
 * qui veut dire qu'il est peint à l'instant où la fenêtre s'ouvre. Tout ce qui
 * le suit, lui, attend la requête personnelle.
 *
 * Une seule énigme est ouverte à la fois, et le composant est donc unique : ce
 * qui change, c'est laquelle. `null` est ce qui ferme la fenêtre.
 */
export function EnigmaDialog({
  enigma,
  play,
  loading,
  stale,
  pending,
  onClose,
  onSubmit,
}: Readonly<{
  /** L'énigme ouverte, ou null quand la fenêtre est fermée. */
  enigma: Enigma | null
  play: EnigmaPlay | undefined
  loading: boolean
  /** La grille affichée n'est plus celle du jour : plus rien ne s'enregistre. */
  stale: boolean
  pending: boolean
  onClose: () => void
  onSubmit: (footballerId: string | null) => void
}>) {
  return (
    <Modal
      open={enigma !== null}
      title={enigma === null ? '' : positionHeading(enigma.position)}
      onClose={onClose}
    >
      {enigma === null ? null : (
        <>
          <Parcours passages={enigma.passages} />

          {/* La fenêtre couvre la page, donc tout ce qui s'affiche sous les
              cartes est invisible d'ici : ce qui empêche de jouer doit être
              redit à l'intérieur, et surtout dit pour la bonne raison. Une
              grille qui a tourné n'est pas une progression illisible — le
              serveur refuse l'essai dans un cas et n'a pas répondu dans
              l'autre. */}
          {stale ? (
            <div className="px-5 pt-4">
              <StaleGridNotice />
            </div>
          ) : null}

          {/* Ce qui tient la place de l'essai le temps que la partie arrive. */}
          {play === undefined && !stale ? <Waiting loading={loading} /> : null}

          {/* L'essai, les indices et — à la fin, et seulement là — la réponse. */}
          <EnigmaEssai play={play} pending={pending} onSubmit={onSubmit} />
        </>
      )}
    </Modal>
  )
}

/**
 * Le parcours : les clubs dans l'ordre de la carrière, et rien d'autre.
 *
 * Pas de dates, pas de nationalité, pas de chiffres — ce sont les étages de
 * l'échelle de dévoilement, et ils arrivent par une requête qui sait qui
 * demande. Le blason est la seule chose ajoutée depuis, et c'est le même fait
 * public que le nom qu'il accompagne.
 */
function Parcours({ passages }: Readonly<{ passages: readonly EnigmaPassage[] }>) {
  return (
    <ol className="flex flex-col gap-1 px-5 py-4">
      {passages.map((passage, index) => (
        // Un club traversé deux fois est deux passages à leurs deux places dans
        // la chronologie : le nom du club n'est pas une clé, l'index en est une.
        <li key={index} className="flex items-center gap-3 text-base">
          <span className="w-4 shrink-0 text-sm text-neutral-400 tabular-nums">
            {index + 1}
          </span>
          <ClubCrest crestKey={passage.crestKey} className="size-8" />
          <span>{passage.clubName}</span>
          {passage.isLoan ? (
            /* Une annotation à côté du club, jamais un club à part entière. */
            <span className="text-sm text-neutral-500">(prêt)</span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/** L'attente de la partie, et son échec, qui ne se disent pas pareil. */
function Waiting({ loading }: Readonly<{ loading: boolean }>) {
  if (!loading) {
    return (
      <div className="px-5 pt-4">
        <UnavailableNotice />
      </div>
    )
  }

  return (
    <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-500">
      Votre partie arrive…
    </p>
  )
}
