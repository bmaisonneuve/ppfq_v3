'use client'

import type { ReactNode } from 'react'

/**
 * Les deux choses qui peuvent mal tourner sur l'écran du jeu, dites au joueur.
 *
 * Elles sont séparées parce qu'elles ne demandent pas la même chose : une
 * grille qui a tourné se répare en rechargeant, une progression qui n'est pas
 * arrivée ne se répare pas depuis ici. Confondre les deux sous un « une erreur
 * est survenue » ferait recharger dans le second cas, pour rien.
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

export function UnavailableNotice() {
  return <Notice>Votre progression n’a pas pu être chargée.</Notice>
}

function Notice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-row font-mono text-meta text-ink bg-white px-[14px] py-[11px]">
      {children}
    </p>
  )
}
