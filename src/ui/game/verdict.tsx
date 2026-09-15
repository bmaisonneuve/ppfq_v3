'use client'

import { useEffect, useState } from 'react'

import { HINT_LABELS } from '@/shared/play'
import type { EnigmaPlay, HintTier } from '@/shared/play'
import type { Position } from '@/shared/schedule'

/**
 * Le verdict d'un essai : ce qui vient de se passer, par opposition à ce qui
 * est à l'écran.
 *
 * L'écran sait lire une partie — trois essais dépensés, deux indices dévoilés —
 * mais une partie ne dit pas *quand* elle est devenue ça. Le serveur renvoie
 * une partie entière à chaque essai (`shared/play.ts`), l'état la remplace, et
 * plus rien ensuite ne distingue l'indice gagné il y a une seconde de celui
 * gagné il y a dix minutes. Le verdict est exactement cette différence-là, et
 * c'est la seule chose que les animations de cet écran consomment.
 *
 * Il est calculé et jamais transmis : le serveur n'a pas à apprendre un mot de
 * plus pour que l'interface sache quoi célébrer, et `verdictOf` ne lit que deux
 * parties que l'écran tenait déjà.
 */
export type Verdict = {
  /**
   * Le rang de l'essai dans la visite. Deux essais peuvent produire un verdict
   * identique en tout point — deux mauvaises réponses de suite dévoilent deux
   * indices différents, mais deux tours passés se ressemblent — et une
   * animation CSS ne rejoue pas quand rien ne change dans l'arbre. C'est ce
   * numéro qui change, et c'est lui qui relance la séquence.
   */
  serial: number
  /**
   * L'instant où l'essai a été joué.
   *
   * C'est ce qui distingue un verdict qu'on est en train de vivre d'un verdict
   * qu'on relit, et c'est une date plutôt qu'un drapeau exprès : un drapeau
   * demanderait un minuteur, donc un état, donc un endroit de plus où « c'est
   * neuf » peut rester vrai après coup. Une date ne se périme jamais mal —
   * revenir sur un niveau une heure plus tard le lit vieux sans que personne
   * n'ait eu à l'éteindre.
   */
  at: number
  /** Le niveau concerné, et la raison d'être de `verdictAt`. */
  position: Position
  /**
   * Les quatre issues d'un essai, et il n'y en a pas cinq : le doublon est une
   * erreur ordinaire, ici comme dans le service (`play.service.ts`), donc il
   * prend le chemin de `wrong` sans rien de particulier.
   */
  kind: 'wrong' | 'passed' | 'solved' | 'lost'
  /** Le palier que **cet** essai vient de payer, quand il en paie un. */
  tier: HintTier | null
  /** Le footballeur proposé, pour le nommer à l'écran. Null pour un tour passé. */
  proposed: string | null
  triesUsed: number
}

/**
 * Le verdict d'un essai, ou rien du tout.
 *
 * `null` est le double-clic et c'est la raison d'être de la comparaison : le
 * même footballeur proposé deux fois en moins de deux secondes ne consomme rien
 * et le serveur répond **la partie inchangée** (`shared/play.ts`,
 * `DOUBLE_SUBMIT_MS`). Une animation à ce moment-là annoncerait une erreur qui
 * n'a pas eu lieu et ferait clignoter un jeton que personne n'a dépensé.
 *
 * Le palier dévoilé est le dernier de la liste, et il n'est dévoilé que si la
 * liste s'est allongée : l'échelle est cumulative et n'ajoute qu'un palier par
 * erreur (`server/domain/reveal-ladder.ts`), donc le dernier est forcément le
 * neuf. L'essai qui trouve n'en paie aucun, et la sixième erreur non plus —
 * elle n'a plus rien à donner et donne la réponse.
 */
export function verdictOf(args: {
  serial: number
  /** La partie telle qu'elle était avant l'essai. */
  before: EnigmaPlay | undefined
  /** Celle que le serveur vient de renvoyer. */
  after: EnigmaPlay
  proposed: string | null
}): Verdict | null {
  const { before, after } = args

  // L'égalité sur `triesUsed` suffit à dire que `before` existe : rien d'autre
  // qu'un nombre ne vaut un nombre.
  if (before?.triesUsed === after.triesUsed && before.status === after.status) return null

  const revealed =
    after.hints.length > (before?.hints.length ?? 0) ? (after.hints.at(-1)?.tier ?? null) : null

  return {
    serial: args.serial,
    at: Date.now(),
    position: after.position,
    kind: kindOf(after, args.proposed),
    tier: revealed,
    proposed: args.proposed,
    triesUsed: after.triesUsed,
  }
}

function kindOf(play: EnigmaPlay, proposed: string | null): Verdict['kind'] {
  if (play.status === 'solved') return 'solved'
  if (play.status === 'failed') return 'lost'

  return proposed === null ? 'passed' : 'wrong'
}

/**
 * Combien de temps un verdict est un **instant**, par opposition à une
 * information.
 *
 * Les deux ne vivent pas aussi longtemps et c'est tout l'intérêt de les
 * séparer : la bande qui nomme l'indice reste jusqu'à l'essai suivant — un
 * joueur qui lève les yeux trois secondes trop tard n'a rien manqué — tandis
 * que la secousse, la ola et les confettis ne se rejouent pas. Sans cette
 * distinction, revenir sur un niveau déjà joué relancerait la fête.
 *
 * Deux secondes et demie, et c'est le glossaire qui le dit (CONTEXT.md,
 * « Verdict ») : la fenêtre est une règle du domaine, pas un réglage de
 * `globals.css`. Elle couvre la plus longue séquence avec de la marge — le
 * dernier confetti tombe à 2,02 s, 1700 ms de vol après 320 ms d'attente au
 * plus, et le bouton de la suite se lève à 1,5 s — parce qu'une fenêtre calée
 * au millième sur la dernière image serait fausse au premier téléphone qui
 * rend une image en retard.
 */
const LIVE_MS = 2500

/**
 * Le verdict de ce niveau-là, et rien de ce qui s'est passé sur les deux
 * autres.
 *
 * Le verdict vit dans le layout, qui ne se remonte pas d'un niveau à l'autre
 * (`game-provider.tsx`) : sans ce filtre, l'écran du titulaire fêterait
 * l'énigme trouvée sur l'échauffement.
 */
export function verdictAt(verdict: Verdict | null, position: Position): Verdict | null {
  return verdict?.position === position ? verdict : null
}

/**
 * Vrai quand cet essai-là est celui qui a terminé la partie.
 *
 * Trois écrans posent la même question pour trois raisons différentes — la
 * carte réponse entre, le bouton de la suite se lève, l'icône du niveau
 * éclate — et ils doivent y répondre pareil.
 */
export function closes(verdict: Verdict | null): boolean {
  return verdict !== null && (verdict.kind === 'solved' || verdict.kind === 'lost')
}

/**
 * Vrai pendant l'instant qui suit un essai, faux dès qu'on le relit.
 *
 * Une lecture et non un état : rien à éteindre, et surtout rien qui puisse
 * rester allumé. Revenir sur un niveau déjà joué remonte ses composants, et un
 * drapeau remonté vaut « c'est neuf » — les trois niveaux auraient rejoué leur
 * dernière animation à chaque aller-retour.
 *
 * La lecture reste la vérité ; ce qu'il lui manque, c'est qu'on la relise à la
 * fin de la fenêtre, et c'est tout ce que `useLive` ajoute.
 */
export function isLive(verdict: Verdict | null): verdict is Verdict {
  return verdict !== null && Date.now() - verdict.at < LIVE_MS
}

/**
 * Le verdict tant qu'il est un instant, et `null` à la seconde où il cesse de
 * l'être.
 *
 * `isLive` seul ne suffit pas : c'est une lecture, et une lecture ne se refait
 * qu'au rendu suivant. Sans minuteur, rien ne redessine l'écran à la fin de la
 * fenêtre — la gerbe et ses mille éclats restaient montés jusqu'au prochain
 * essai, c'est-à-dire indéfiniment sur une partie qui vient de se terminer.
 *
 * Le minuteur ne retient rien : il ne fait que redemander un rendu, et c'est
 * `isLive` qui tranche à nouveau, sur la date. Un composant remonté une heure
 * plus tard lit donc toujours « vieux » sans que personne n'ait eu à
 * l'éteindre, ce qui est exactement la propriété qu'on voulait garder.
 */
export function useLive(verdict: Verdict | null): Verdict | null {
  const [, relire] = useState(0)
  const live = isLive(verdict)

  useEffect(() => {
    if (!isLive(verdict)) return

    const timer = setTimeout(
      () => { relire((n) => n + 1) },
      verdict.at + LIVE_MS - Date.now(),
    )

    return () => { clearTimeout(timer) }
  }, [verdict])

  return live ? verdict : null
}

/**
 * La vibration qui accompagne l'instant.
 *
 * Elle n'est pas une décoration de plus : sur un téléphone tenu à une main,
 * c'est elle qui dit « c'est tombé » à quelqu'un qui regardait ailleurs. Deux
 * motifs seulement — une pulsation double pour ce qui se fête, une seule et
 * brève pour ce qui coûte.
 *
 * Appelée par l'annonce, qui est le seul composant monté à chaque essai quoi
 * qu'il arrive : la bande disparaît quand la partie se termine, et c'est
 * justement l'essai qu'il faut sentir.
 */
function buzz(verdict: Verdict): void {
  try {
    // Typée comme toujours présente, et absente sur iOS ; refusée aussi tant
    // que la page n'a pas été touchée. Son échec n'est rien.
    navigator.vibrate(verdict.kind === 'solved' ? [12, 50, 26] : [16])
  } catch {
    // Un appareil qui ne vibre pas est un appareil qui ne vibre pas.
  }
}

/**
 * La bande du verdict : ce que l'essai a coûté, et ce qu'il a rapporté.
 *
 * Elle ne s'affiche que pour un essai qui laisse la partie ouverte. Une partie
 * finie a déjà sa carte réponse, qui dit la même chose en plus grand et en plus
 * lisible ; répéter « TROUVÉ » juste en dessous n'ajouterait qu'une ligne à
 * lire.
 *
 * Les deux moitiés ne sont pas de la même couleur, et c'est la règle : le rouge
 * dit la dépense, l'encre dit le gain. Peindre l'indice en rouge parce qu'il
 * arrive après une erreur l'habillerait en punition, alors que c'est
 * exactement ce que l'essai vient d'acheter.
 */
export function VerdictBand({ verdict }: Readonly<{ verdict: Verdict | null }>) {
  if (verdict === null) return null
  if (verdict.kind === 'solved' || verdict.kind === 'lost') return null

  return (
    <p
      // Le numéro d'essai remonte la bande à chaque verdict : deux tours passés
      // de suite produisent le même texte, et sans remontage la bande
      // n'entrerait qu'une fois.
      key={verdict.serial}
      className="rounded-row animate-band flex flex-wrap items-center gap-x-[8px] gap-y-[4px] bg-white px-[12px] py-[9px]"
    >
      <span className="font-mono text-overline text-missed uppercase">
        {verdict.proposed === null ? 'Tour passé' : `✗ ${verdict.proposed}`}
      </span>

      {verdict.tier === null ? null : (
        <>
          <span aria-hidden className="text-ink/25">
            •
          </span>
          <span className="font-mono text-overline text-ink uppercase">
            Indice {verdict.tier} · {HINT_LABELS[verdict.tier]}
          </span>
        </>
      )}
    </p>
  )
}

/**
 * Le verdict dit à voix haute.
 *
 * L'animation *est* le message — un tremblement, une colonne qui se déplie —
 * et rien de tout cela ne se lit à voix haute. Cette région le redit en une
 * phrase, donc un lecteur d'écran apprend la même chose au même moment, et le
 * joueur qui a coupé les animations (`prefers-reduced-motion`) aussi.
 *
 * `role="status"` et non `alert` : une erreur au sixième essai n'est pas une
 * alarme, c'est la fin d'une partie.
 */
export function VerdictAnnounce({ verdict }: Readonly<{ verdict: Verdict | null }>) {
  const serial = verdict?.serial ?? null

  useEffect(() => {
    if (verdict === null || !isLive(verdict)) return

    buzz(verdict)
    // Le numéro d'essai, et lui seul : le verdict est immuable, donc deux
    // essais sont deux numéros et un rendu de plus ne fait pas vibrer deux
    // fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial])

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {verdict === null ? '' : announce(verdict)}
    </p>
  )
}

function announce(verdict: Verdict): string {
  const hint =
    verdict.tier === null ? '' : ` Indice dévoilé : ${HINT_LABELS[verdict.tier].toLowerCase()}.`

  switch (verdict.kind) {
    case 'wrong':
      return `Raté, ce n’est pas ${verdict.proposed ?? ''}.${hint}`
    case 'passed':
      return `Tour passé, un essai consommé.${hint}`
    case 'solved':
      return `Trouvé en ${verdict.triesUsed} essai${verdict.triesUsed > 1 ? 's' : ''}.`
    case 'lost':
      return 'Perdu, la partie est terminée. La réponse est affichée.'
  }
}
