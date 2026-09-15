'use client'

import Link from 'next/link'

import { dayNeighbours } from '@/shared/archive'
import type { DayStep } from '@/shared/archive'
import { formatGridDate } from '@/shared/schedule'
import { ChevronIcon } from '@/ui/chevron-icon'

import { ICON_SHAPE, ICON_SKIN } from './chrome'
import { useDay } from './game-provider'

/**
 * Les deux flèches de l'en-tête d'une journée : la veille, le lendemain.
 *
 * Le pendant de la navigation par mois du calendrier de programmation
 * (`ui/admin/month-calendar.tsx`) : un pas de temps, deux boutons de la même
 * pièce que le reste de l'en-tête, posés sous ce qu'ils font bouger. Le pas
 * est ici le **jour** parce que c'est l'unité du jeu — une grille est une
 * journée — et parce que revenir à hier depuis la grille du jour demandait
 * jusque-là de passer par le calendrier, deux écrans pour un pas.
 *
 * Elles sont là **avec ou sans grille** : un jour où rien n'est programmé est
 * une journée comme une autre, et c'est l'écran depuis lequel on veut le plus
 * pouvoir continuer — sans elles, tomber sur un trou en remontant l'archive
 * était un cul-de-sac dont on ne sortait que par le calendrier.
 *
 * Elles mènent toujours à l'**aperçu** de la journée voisine et jamais au même
 * niveau chez le voisin : la position où l'on en est d'une grille n'a pas de
 * sens dans une autre, et l'aperçu est justement l'écran qui dit où reprendre.
 * Sur un grand écran, il passe aussitôt la main au niveau à reprendre de cette
 * journée-là (`home-screen.tsx`), ce qui est la bonne réponse des deux côtés.
 *
 * Ce qu'elles ne font pas est aussi net : elles ne sautent pas les jours sans
 * grille, et elles ne s'arrêtent pas devant une journée qu'un compte ouvre.
 * Savoir lesquels sauter demanderait de lire le calendrier entier à chaque
 * en-tête, et surtout un trou est une information — c'est ce que l'écran des
 * jours sans grille existe pour dire. Le voisin est le voisin ; c'est la
 * destination qui explique ce qu'elle est (`archive-gate.tsx`).
 */
export function DayNav() {
  const { date, today } = useDay()
  const { previous, next } = dayNeighbours(date, today)

  return (
    // `ml-auto` : les flèches tiennent le bord droit de leur ligne, que la
    // pastille de thème soit à gauche ou qu'il n'y en ait aucune — un jour sans
    // grille n'a pas de thème, et ses flèches ne doivent pas glisser au bord
    // opposé pour autant.
    <nav aria-label="Changer de journée" className="ml-auto flex items-center gap-[6px]">
      <DayLink step={previous} direction="previous" />

      {/* La grille du jour n'a pas de lendemain à proposer, et la place reste
          prise : une flèche qui disparaîtrait ferait sauter l'autre d'un cran
          d'un jour à l'autre. Éteinte plutôt qu'absente, et `aria-hidden` —
          il n'y a rien à annoncer d'une destination qui n'existe pas. */}
      {next === null ? (
        <span aria-hidden className={`${ICON_SHAPE} border-white/20 text-white/20`}>
          <ChevronIcon direction="next" />
        </span>
      ) : (
        <DayLink step={next} direction="next" />
      )}
    </nav>
  )
}

/**
 * Une flèche, et la journée où elle mène.
 *
 * Un chevron seul ne nomme pas sa destination, donc le nom accessible la dit
 * en toutes lettres — « Aller au mardi 10 septembre » — et `title` la redonne
 * en infobulle à la souris. C'est la même retenue que le calendrier du
 * back-office, où le mois voisin est écrit dans le bouton faute de place ici
 * pour l'y écrire.
 */
function DayLink({
  step,
  direction,
}: Readonly<{ step: DayStep; direction: 'previous' | 'next' }>) {
  const when = formatGridDate(step.date)

  return (
    <Link
      href={step.href}
      aria-label={`Aller au ${when.toLowerCase()}`}
      title={when}
      className={`${ICON_SHAPE} ${ICON_SKIN}`}
    >
      <ChevronIcon direction={direction} />
    </Link>
  )
}
