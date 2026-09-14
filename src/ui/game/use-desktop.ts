'use client'

import { useSyncExternalStore } from 'react'

/**
 * Le format d'écran, quand le CSS ne suffit pas à le dire.
 *
 * Presque tout ce qui sépare le téléphone de l'ordinateur est écrit en `lg:`
 * sur les mêmes éléments (`chrome.tsx`), et c'est la bonne façon : une règle
 * CSS est vraie dès le premier pixel peint, avant que React n'ait hydraté la
 * page prérendue. Deux choses ne peuvent pas l'être, et ce sont les deux seuls
 * appels de ce hook :
 *
 * - **Le champ de saisie.** Le bandeau du téléphone empile le champ puis les
 *   deux boutons ; celui de l'ordinateur range « Valider » *dans* le champ
 *   (`1c`). Deux arbres montés ensemble et masqués l'un ou l'autre, ce serait
 *   deux `<input>` dans la page — donc deux saisies en cours, et une liste de
 *   suggestions qui n'est pas celle qu'on voit.
 * - **Le défi que l'accueil de l'ordinateur ouvre d'office.** Ouvrir une
 *   énigme crée une partie (ADR-0009), et une partie ouverte non terminée
 *   compte comme un échec quand la grille tourne. Un arbre simplement caché en
 *   CSS l'aurait créée sur les téléphones aussi, pour un écran que personne
 *   n'y voit jamais.
 *
 * `useSyncExternalStore` et non un `useState` posé dans un `useEffect` : la
 * réponse est juste **dès le premier rendu client**, donc rien n'est monté au
 * format téléphone pour être remplacé au rendu suivant. L'instantané serveur
 * vaut `false` — le HTML prérendu est celui du téléphone, et sur un grand
 * écran il est de toute façon masqué par `lg:`.
 */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, serverSnapshot)
}

/**
 * Le point de bascule, et il n'est pas choisi ici : `64rem` est le `lg:` de
 * Tailwind. Les deux moitiés de la décision — les classes et ce hook — doivent
 * changer d'avis au même pixel, sinon l'écran montre un rail sans champ de
 * saisie ou l'inverse.
 */
const DESKTOP = '(min-width: 64rem)'

/**
 * Une seule `MediaQueryList`, gardée entre les rendus : `getSnapshot` est
 * appelé à chaque rendu de chaque composant qui lit le format, et
 * `matchMedia()` y créerait autant d'objets.
 */
let query: MediaQueryList | null = null

function media(): MediaQueryList {
  query ??= window.matchMedia(DESKTOP)

  return query
}

function subscribe(onChange: () => void): () => void {
  const list = media()
  list.addEventListener('change', onChange)

  return () => {
    list.removeEventListener('change', onChange)
  }
}

function isDesktop(): boolean {
  return media().matches
}

const serverSnapshot = (): boolean => false
