'use client'

import { useEffect, useState } from 'react'

import { formatCountdown, msUntilNextGrid } from '@/shared/countdown'

/**
 * « Nouvelle grille dans 07 h 12 », rafraîchi chaque minute.
 *
 * Rend `null` au premier rendu, et c'est la seule façon correcte de l'écrire :
 * la page de la grille est prérendue et servie depuis un cache partagé (#8),
 * donc une durée calculée au rendu serveur serait celle de l'instant où la page
 * a été fabriquée — juste pour le premier visiteur, fausse de plusieurs heures
 * pour tous les suivants, et divergente à l'hydratation. Le compte à rebours
 * naît donc dans le navigateur, après le premier peint.
 *
 * La minute est le pas d'affichage, donc le pas de rafraîchissement : un
 * intervalle à la seconde referait un rendu soixante fois pour rien.
 */
export function useCountdown(): string | null {
  const [left, setLeft] = useState<string | null>(null)

  useEffect(() => {
    const tick = (): void => {
      setLeft(formatCountdown(msUntilNextGrid(new Date())))
    }

    tick()
    const timer = setInterval(tick, 60_000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  return left
}
