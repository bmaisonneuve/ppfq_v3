'use client'

import { useEffect, useRef, useState } from 'react'

import { ENIGMA_STATS_PATH } from '@/shared/enigma-stats'
import type { EnigmaStats } from '@/shared/enigma-stats'
import type { ChallengeDate, Position } from '@/shared/schedule'

/**
 * Les chiffres d'une énigme, demandés quand la partie est finie.
 *
 * ## Hors de la file, et c'est la seule requête du jeu qui en a le droit
 *
 * Tout le reste passe par la file de `use-day-plays.ts`, pour une raison qui
 * n'a rien d'un rangement : une requête personnelle lancée à côté d'une autre
 * crée **deux joueurs** chez un visiteur sans cookie (ADR-0009). Celle-ci ne
 * crée rien. C'est un GET public qui ne lit pas de cookie, n'en pose pas et ne
 * nomme personne, donc il n'y a pas d'identité à sérialiser — la faire
 * attendre derrière la file l'aurait rangée derrière l'essai suivant, pour un
 * panneau qui doit apparaître juste après celui qui vient d'être joué.
 *
 * ## Une seule demande par énigme, et rien avant la fin
 *
 * `over` est ce qui déclenche, et il ne redescend jamais : une partie terminée
 * le reste. La demande part donc une fois par `(date, position)` — le second
 * rendu d'un même écran ne redemande rien, et rejouer un essai non plus,
 * puisqu'il n'y en a plus à jouer.
 *
 * La réponse est rangée **avec la clé qui l'a demandée**. Passer de `/1` à `/2`
 * est une navigation client, et React peut garder l'état de l'écran d'un niveau
 * à l'autre : sans la clé, les chiffres de l'échauffement s'afficheraient une
 * fraction de seconde sous la réponse du titulaire.
 *
 * ## Un échec ne se dit pas
 *
 * Contrairement aux statistiques du joueur (`player-stats.tsx`), il n'y a ici
 * ni « elles arrivent » ni « elles n'ont pas pu être chargées » : ce panneau
 * n'a été demandé par personne — il s'affiche de lui-même sous la carte
 * réponse. Une panne le laisse donc absent, exactement comme un seuil non
 * atteint, et c'est la bonne réponse aux deux : l'écran n'a rien promis.
 */
export function useEnigmaStats(
  date: ChallengeDate,
  position: Position,
  /** Vrai une fois la partie terminée — trouvée ou perdue. */
  over: boolean,
): EnigmaStats | undefined {
  const [answer, setAnswer] = useState<{ key: string; stats: EnigmaStats } | null>(null)
  const asked = useRef<string | null>(null)
  const key = `${date}/${String(position)}`

  useEffect(() => {
    if (!over || asked.current === key) return
    asked.current = key

    const aborter = new AbortController()

    void (async () => {
      try {
        const query = new URLSearchParams({ date, position: String(position) })
        const response = await fetch(`${ENIGMA_STATS_PATH}?${query.toString()}`, {
          signal: aborter.signal,
        })
        if (!response.ok) throw new Error(String(response.status))

        setAnswer({ key, stats: (await response.json()) as EnigmaStats })
      } catch {
        // Hors ligne, un 500, un écran quitté avant la réponse. Le panneau
        // reste absent, et il ne manque à personne.
      }
    })()

    return () => {
      // Une demande qu'on abandonne est une demande à refaire : sans ça, revenir
      // sur le niveau laisserait le panneau vide pour toujours.
      asked.current = null
      aborter.abort()
    }
  }, [date, position, over, key])

  return answer?.key === key ? answer.stats : undefined
}
