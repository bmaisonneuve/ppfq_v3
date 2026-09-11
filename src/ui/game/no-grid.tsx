import { GameShell } from './chrome'

/**
 * Le jour où rien n'est programmé.
 *
 * Il n'a pas d'en-tête : sans grille il n'y a ni date de journée, ni thème, ni
 * niveau à ouvrir — une barre segmentée vide et une pastille de thème absente
 * feraient un écran cassé là où il n'y a qu'un calendrier incomplet. La marque
 * reste, et le reste attend demain.
 */
export function NoGridView() {
  return (
    <GameShell>
      <div className="flex flex-1 flex-col justify-center gap-3 px-4 py-10">
        <h1 className="font-display text-score text-white">Pas de grille aujourd’hui</h1>
        <p className="font-mono text-meta text-ink">
          Aucune grille n’est programmée pour la journée. Revenez demain.
        </p>
      </div>
    </GameShell>
  )
}
