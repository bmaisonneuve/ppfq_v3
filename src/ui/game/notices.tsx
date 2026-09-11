'use client'

import type { ReactNode } from 'react'

/**
 * Les deux choses que le jeu doit dire quand il ne peut pas tenir sa promesse.
 *
 * Elles sont dans un fichier à elles parce qu'elles s'affichent à deux endroits
 * : sous les cartes, et **dans la fenêtre d'une énigme**. Une fenêtre modale
 * couvre la page, donc un avis posé derrière elle n'existe pas pour le joueur
 * qui est en train de jouer — et c'est précisément le moment où il a besoin de
 * le lire. Deux formulations pour la même panne, c'est deux vérités qui
 * divergent le jour où l'une des deux est corrigée.
 */

/**
 * La grille à l'écran n'est plus la grille du jour.
 *
 * La page est prérendue et servie par un cache partagé pendant une minute
 * (ADR-0008), donc quelqu'un qui arrive à minuit peut tenir celle de la veille.
 * Le serveur n'ouvrira pas de partie dessus — rien de ce qu'il ferait ne serait
 * enregistré — alors le dire vaut mieux que le laisser jouer dans le vide.
 */
export function StaleGridNotice() {
  return (
    <Notice>
      La grille du jour a changé depuis l’ouverture de cette page.{' '}
      <button
        type="button"
        onClick={() => {
          window.location.reload()
        }}
        className="cursor-pointer underline underline-offset-2"
      >
        Recharger
      </button>
    </Notice>
  )
}

/**
 * L'état personnel n'a pas pu être lu.
 *
 * Le dire, plutôt que d'afficher zéro essai partout : « aucune partie » et
 * « on n'a pas pu demander » se ressemblent à l'écran et un seul des deux est
 * vrai. Le parcours n'est pas concerné — il est venu avec la page.
 */
export function UnavailableNotice() {
  return <Notice>Votre progression n’a pas pu être chargée.</Notice>
}

function Notice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
      {children}
    </p>
  )
}
