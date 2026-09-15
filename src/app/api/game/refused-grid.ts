import { PERSONAL_HEADERS } from '../personal-request'

import type { GridRefusedError } from '@/server/services/play.service'

/**
 * Le refus d'une grille, en HTTP — partagé par les deux portes qui jouent.
 *
 * L'état personnel et l'essai refusent exactement les mêmes grilles pour
 * exactement les mêmes raisons (`server/domain/archive.ts`), donc la traduction
 * est écrite une fois : deux statuts différents pour le même motif seraient
 * deux réponses à donner à l'écran.
 *
 * **Deux statuts et non un**, parce que les deux motifs ne demandent pas la
 * même chose à celui qui les reçoit :
 *
 * - `403` pour l'archive au-delà des sept jours ouverts. La grille existe, elle
 *   est jouable, et il manque un compte — c'est une invitation à s'inscrire, et
 *   le seul refus du jeu qui se répare en dix secondes ;
 * - `404` pour une grille à venir. Elle est programmée, donc la ligne existe en
 *   base, mais elle n'est pas encore une grille pour qui que ce soit : dire
 *   « interdit » laisserait entendre qu'un compte l'ouvrirait, et dire
 *   « demain » dirait déjà quelque chose de ce qui est programmé.
 *
 * Aucun des deux n'est un `409` : celui-là dit « la partie n'est pas en état de
 * prendre cet essai » et le client y répond en relisant l'état (`use-day-plays`),
 * ce qui ici échouerait exactement pareil.
 */
export function refusedGrid(error: GridRefusedError): Response {
  const status = error.reason === 'account-required' ? 403 : 404

  return Response.json({ error: error.reason }, { status, headers: PERSONAL_HEADERS })
}
