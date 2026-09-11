import 'server-only'

import { and, count, eq, sql } from 'drizzle-orm'

import { db } from '@/server/db/client'
import type { Tx } from '@/server/db/client'
import { challengeItems, dailyChallenges, playerProgress, playerStats } from '@/server/db/schema'
import { todayInParis } from '@/server/domain/challenge-calendar'
import { displayedSerie, serieAfterTitulaire } from '@/server/domain/stats'
import { MAX_TRIES } from '@/shared/play'
import type { PlayMode } from '@/shared/play'
import { POSITIONS, TITULAIRE } from '@/shared/schedule'
import type { ChallengeDate, Position } from '@/shared/schedule'
import { NO_STATS } from '@/shared/stats'
import type { PlayerStats } from '@/shared/stats'

/**
 * Les agrégats d'un joueur : la série, les cartons pleins, ce qu'il a joué.
 *
 * ## Écrits par la partie, dans la transaction qui la bouge
 *
 * Il n'y a **pas de job de réconciliation** (`docs/modele-donnees.md` §5), et
 * c'est la décision dont tout le reste de ce fichier découle : un agrégat faux
 * ne se répare pas tout seul la nuit suivante. Les deux fonctions d'écriture
 * prennent donc une transaction et n'en ouvrent aucune — elles sont appelées
 * *dans* celle de `play.service.ts`, de sorte qu'il n'existe aucun instant où
 * une partie a bougé et où son compte ne l'a pas suivie.
 *
 * Deux moments, et deux seulement :
 *
 * - **l'ouverture** compte une partie jouée. Pas la fin : « une partie ouverte
 *   compte comme jouée, même abandonnée » (specs §5), et une partie abandonnée
 *   n'a par définition pas de fin à laquelle se compter ;
 * - **la fin** compte la réussite, le carton plein et la série.
 *
 * ## L'upsert est aussi le verrou, et ce n'est pas un effet de bord
 *
 * `countFinish` commence par un `INSERT … ON CONFLICT DO UPDATE` qui ne change
 * rien : il crée la ligne si elle manque, et surtout il la **verrouille**. Deux
 * parties du même joueur qui se terminent en même temps — deux onglets, la file
 * du client contournée — se sérialisent donc sur cette ligne. Sans ça, chacune
 * compterait les énigmes trouvées de la grille sans voir celle que l'autre
 * vient d'écrire, et le carton plein se perdrait entre les deux : deux
 * transactions verraient chacune deux énigmes sur trois.
 *
 * ## La répartition ne se stocke pas
 *
 * C'est un `GROUP BY tries_used` sur les parties résolues du joueur, qui en a
 * au plus trois par jour (`docs/modele-donnees.md` §5, §9). Une colonne par
 * nombre d'essais serait six fois le même fait, et la table ne porte que ce qui
 * doit se lire en O(1) ou survivre à la purge des vieilles parties.
 */

/**
 * Ce qu'un joueur lit de son histoire, dans un mode.
 *
 * `mode` est un argument et pas une constante : l'archive est comptée
 * séparément (specs §7), et le jour où elle arrive (#11) c'est la seule chose
 * qui change ici. Rien n'additionne jamais les deux — il faudrait choisir
 * laquelle des deux séries afficher.
 *
 * La série sort **déjà remise à zéro** : la colonne n'est jamais servie telle
 * quelle, et `last_solved_challenge` ne sort pas du tout. Un client qui la
 * recevrait aurait une deuxième définition de la série.
 */
export async function getPlayerStats(
  playerId: string,
  mode: PlayMode = 'daily',
): Promise<PlayerStats> {
  const [stored, solvedByTries] = await Promise.all([
    readStatsRow(playerId, mode),
    readDistribution(playerId, mode),
  ])

  if (stored === undefined) return { ...NO_STATS, solvedByTries }

  return {
    playedCount: stored.playedCount,
    solvedCount: stored.solvedCount,
    perfectChallenges: stored.perfectChallenges,
    serie: displayedSerie(stored, todayInParis()),
    bestSerie: stored.bestStreak,
    solvedByTries,
  }
}

async function readStatsRow(playerId: string, mode: PlayMode) {
  const rows = await db
    .select()
    .from(playerStats)
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.mode, mode)))
    .limit(1)

  return rows[0]
}

/**
 * Les réussites par nombre d'essais, en un tableau de `MAX_TRIES` entrées.
 *
 * Les **réussites** et non les parties terminées : c'est ce que demandent les
 * specs §5, et une partie perdue n'a pas de « nombre d'essais » à ranger — elle
 * en a six, comme toutes les autres parties perdues.
 *
 * Le statut est lu dans la colonne et non par la règle de lecture, et c'est
 * exact ici : la règle ne transforme que des `in_progress`, jamais un `solved`
 * (`server/domain/play.ts`).
 */
async function readDistribution(playerId: string, mode: PlayMode): Promise<number[]> {
  const rows = await db
    .select({ triesUsed: playerProgress.triesUsed, solved: count() })
    .from(playerProgress)
    .where(
      and(
        eq(playerProgress.playerId, playerId),
        eq(playerProgress.mode, mode),
        eq(playerProgress.status, 'solved'),
      ),
    )
    .groupBy(playerProgress.triesUsed)

  const distribution = Array.from({ length: MAX_TRIES }, () => 0)
  for (const row of rows) {
    // Une partie trouvée a consommé de 1 à `MAX_TRIES` essais. Une valeur hors
    // de ces bornes est une ligne écrite à la main : elle est ignorée plutôt
    // que de faire déborder le tableau que l'interface dessine.
    const index = row.triesUsed - 1
    if (index >= 0 && index < MAX_TRIES) distribution[index] = row.solved
  }

  return distribution
}

/**
 * La ligne d'agrégat d'un joueur, nommée une fois : c'est la contrainte unique
 * `(player_id, mode)` du modèle, et c'est elle qui fait de l'upsert un verrou.
 */
const AGGREGATE_OF = [playerStats.playerId, playerStats.mode]

/**
 * Une partie vient de naître : elle compte comme jouée.
 *
 * Appelée **uniquement quand la ligne a réellement été insérée**, ce que dit le
 * `RETURNING` vide d'un `on conflict do nothing` : une énigme repliée puis
 * dépliée, un rechargement, un second onglet ne rouvrent rien et ne comptent
 * donc rien.
 */
export async function countOpening(
  tx: Tx,
  args: { playerId: string; mode: PlayMode },
): Promise<void> {
  await tx
    .insert(playerStats)
    .values({ playerId: args.playerId, mode: args.mode, playedCount: 1 })
    .onConflictDoUpdate({
      target: AGGREGATE_OF,
      set: { playedCount: sql`${playerStats.playedCount} + 1` },
    })
}

/**
 * Ce que la fin d'une partie apprend aux agrégats.
 *
 * `status` ne porte que les deux issues d'une partie **terminée** : un essai qui
 * ne termine rien n'appelle pas ici, et c'est le type qui le dit plutôt qu'un
 * commentaire. La garde est chez l'appelant, là où l'issue vient d'être écrite.
 */
export type FinishedPartie = {
  playerId: string
  mode: PlayMode
  /** La grille de la partie — ce sur quoi la série compte des jours. */
  date: ChallengeDate
  position: Position
  status: 'solved' | 'failed'
}

/**
 * Une partie vient de se terminer : la réussite, le carton plein, la série.
 *
 * Dans l'ordre, et l'ordre compte :
 *
 * 1. la ligne d'agrégat est créée si besoin et **verrouillée** ;
 * 2. le carton plein est compté sur la grille, la partie qui vient d'être
 *    écrite comprise — c'est la même transaction ;
 * 3. tout est écrit d'un coup.
 *
 * Une partie **perdue** sort tout de suite, sans même prendre le verrou :
 * `played_count` a été compté à l'ouverture, et il n'y a rien d'autre à faire —
 * l'échec est ce qui reste quand on n'ajoute rien. La série n'est pas remise à
 * zéro pour autant : une absence ne déclenche rien, et c'est la lecture qui
 * tranche (`server/domain/stats.ts`).
 */
export async function countFinish(tx: Tx, partie: FinishedPartie): Promise<void> {
  if (partie.status !== 'solved') return

  const stored = await lockStatsRow(tx, partie)
  const perfect = await isPerfectChallenge(tx, partie)
  const serie =
    // La série ne compte que le titulaire, et seulement dans le quotidien.
    // Le carton plein, lui, n'a pas besoin d'être filtré : la ligne est déjà
    // par mode, donc un carton plein d'archive se compte sur la ligne
    // d'archive, « comptée séparément » (specs §7). La série a besoin du
    // filtre en plus, parce qu'une suite de dates d'archive ne serait pas une
    // suite de jours passés — ce serait la liste des grilles qu'on a choisies.
    partie.position === TITULAIRE && partie.mode === 'daily'
      ? serieAfterTitulaire(stored, partie.date)
      : stored

  await tx
    .update(playerStats)
    .set({
      solvedCount: stored.solvedCount + 1,
      perfectChallenges: stored.perfectChallenges + (perfect ? 1 : 0),
      currentStreak: serie.currentStreak,
      bestStreak: serie.bestStreak,
      lastSolvedChallenge: serie.lastSolvedChallenge,
    })
    .where(eq(playerStats.id, stored.id))
}

/**
 * La ligne d'agrégat du joueur, créée au besoin et tenue jusqu'au commit.
 *
 * Un `ON CONFLICT DO UPDATE` qui réécrit le `player_id` par lui-même : c'est un
 * `SELECT … FOR UPDATE` et un `INSERT` en une seule instruction, sur une ligne
 * qui n'existe peut-être pas encore — ce qu'un `SELECT … FOR UPDATE` seul ne
 * sait pas faire. Le verrou est ce qui sérialise deux fins de partie
 * simultanées du même joueur ; voir l'en-tête du fichier.
 */
async function lockStatsRow(tx: Tx, partie: FinishedPartie) {
  const rows = await tx
    .insert(playerStats)
    .values({ playerId: partie.playerId, mode: partie.mode })
    .onConflictDoUpdate({
      target: AGGREGATE_OF,
      set: { playerId: sql`excluded.player_id` },
    })
    .returning()

  const row = rows[0]
  // Un upsert qui met à jour rend toujours sa ligne : l'absence est impossible,
  // et la dire ici vaut mieux qu'un `!` qui laisserait croire le contraire.
  if (row === undefined) throw new Error('La ligne de statistiques n’a pas été écrite.')

  return row
}

/**
 * Le carton plein : **les trois énigmes de la grille trouvées**.
 *
 * Deux conditions et non une, parce que « la grille entière » et « les trois »
 * ne veulent dire la même chose que sur une grille bien formée. Les specs §5
 * comme le glossaire disent *trois* — et c'est le nombre qui protège : une
 * grille à laquelle il manquerait une position donnerait un carton plein à qui
 * en trouve deux, sur un compteur que le joueur voit. Une grille malformée ne
 * donne donc rien, ce qui est un non-événement de plus sur une grille déjà
 * cassée.
 *
 * Le total est lu quand même plutôt que supposé : c'est ce qui fait que la
 * question posée à la base est « toutes les énigmes de cette grille » et non
 * « trois lignes », et les deux réponses doivent coïncider.
 *
 * Vrai exactement une fois par grille : une partie ne passe à `solved` qu'une
 * fois (compare-and-set), donc une seule transaction peut être celle qui voit
 * la dernière — le verrou pris juste avant est ce qui le garantit quand deux
 * énigmes se terminent ensemble.
 */
async function isPerfectChallenge(tx: Tx, partie: FinishedPartie): Promise<boolean> {
  const rows = await tx
    .select({
      enigmas: count(),
      solved: sql<number>`count(*) filter (where ${playerProgress.status} = 'solved')::int`,
    })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .leftJoin(
      playerProgress,
      and(
        eq(playerProgress.challengeItemId, challengeItems.id),
        eq(playerProgress.playerId, partie.playerId),
        eq(playerProgress.mode, partie.mode),
      ),
    )
    .where(eq(dailyChallenges.date, partie.date))

  const row = rows[0]
  if (row === undefined) return false

  return row.enigmas === POSITIONS.length && row.solved === row.enigmas
}
