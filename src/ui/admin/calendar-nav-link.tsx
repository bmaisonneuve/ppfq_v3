import Link from 'next/link'

import { ChevronIcon } from '@/ui/chevron-icon'

/**
 * Une commande de navigation du calendrier de programmation : le mois d'à côté,
 * le jour d'à côté, le retour au mois.
 *
 * C'est la pièce que le jeu pose déjà sur le vert pour ses boutons d'en-tête
 * (`ui/game/chrome.tsx`) : un contour blanc, un voile de blanc derrière, un
 * carré d'au moins 40 px. Elle était écrite dans le calendrier, pour les mois ;
 * la page d'un jour en veut exactement trois de plus, et deux dessins de la
 * même commande auraient fini par ne plus se ressembler.
 *
 * ## Ce qui est écrit dedans, et ce qui est dit à côté
 *
 * La destination est **nommée** en toutes lettres — « octobre 2026 », « jeudi
 * 10 septembre » — parce qu'un chevron seul ne dit ni où l'on va ni dans quel
 * sens. Le chevron ne fait que le sens, et il se pose du côté où l'on part.
 *
 * `announce` est la phrase que le lecteur d'écran entend à la place : « octobre
 * 2026 » lu tout seul n'est pas une destination. Le nom visible est alors
 * `aria-hidden`, sans quoi il serait annoncé deux fois.
 */
export function CalendarNavLink({
  href,
  label,
  announce,
  direction,
}: Readonly<{
  href: string
  /** Ce qui est écrit dans le bouton : le mois, le jour, ou ce qu'on va faire. */
  label: string
  /** La même chose en phrase, pour qui l'entend plutôt que de la lire. */
  announce: string
  /** De quel côté se pose le chevron — `null` quand le lien ne va pas de côté. */
  direction: 'previous' | 'next' | null
}>) {
  return (
    <Link
      href={href}
      aria-label={announce}
      title={announce}
      className="rounded-icon font-display text-body focus-visible:ring-pitch flex h-10
        min-w-10 shrink-0 cursor-pointer items-center justify-center gap-2 border-[1.5px]
        border-white/60 bg-white/16 px-3 text-white hover:bg-white/25
        focus-visible:ring-2 focus-visible:outline-none"
    >
      {direction === 'previous' ? <ChevronIcon direction="previous" strokeWidth={2} /> : null}
      <span aria-hidden className="truncate">
        {label}
      </span>
      {direction === 'next' ? <ChevronIcon direction="next" strokeWidth={2} /> : null}
    </Link>
  )
}
