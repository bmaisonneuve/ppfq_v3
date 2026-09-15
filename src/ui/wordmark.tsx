import Link from 'next/link'

/**
 * La marque, et le chemin de retour au jeu.
 *
 * Une seule définition pour les deux moitiés de l'application : l'en-tête du
 * joueur et celui du back-office montrent le même ballon et le même mot, parce
 * que c'est un seul produit vu par ses deux bouts — la même raison qui met le
 * thème entier dans `globals.css` plutôt qu'un jeu de couleurs par moitié. Le
 * back-office écrivait « PPFQ », qui est le nom du dépôt et que personne
 * n'emploie.
 *
 * Elle ramène toujours à `/`, la grille du jour. C'est ce qu'un logo fait sur
 * n'importe quel site, et au back-office c'est le seul chemin de retour vers le
 * jeu : l'admin qui vient de programmer un jour veut voir ce que le joueur en
 * verra.
 *
 * Ni `'use client'` ni état : le `<Link>` du châssis du jeu, qui est un
 * composant client, et celui du layout admin, qui est un composant serveur,
 * sont le même arbre — il n'y a rien ici qu'un navigateur ait à reprendre.
 */
export function Wordmark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <BallLogo />
      <span className="font-display text-wordmark text-white">Footguessr</span>
    </Link>
  )
}

/** Le ballon de la marque : un cercle blanc, un pentagone à l'encre. */
function BallLogo() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="#fff" />
      <polygon points="16,8 22,12.4 19.7,19.4 12.3,19.4 10,12.4" fill="#0B2E22" />
    </svg>
  )
}
