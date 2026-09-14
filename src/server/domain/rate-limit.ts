import 'server-only'

/**
 * Combien de fois une clé a le droit de faire quelque chose, et sur quelle
 * durée.
 *
 * Le seul usage aujourd'hui est la demande d'un code ou d'un lien magique,
 * limitée **par IP et par adresse email** (`docs/stack-technique.md` §4bis).
 * Les deux dimensions ne se déduisent pas l'une de l'autre : sans la première
 * une machine énumère les adresses, sans la seconde elle bombarde la boîte d'un
 * tiers — et c'est la seconde qu'on oublie.
 *
 * ## En mémoire, et c'est une décision datée
 *
 * Il y a un réplica (`docs/stack-technique.md` §11), donc un processus, donc
 * une carte suffit et un Redis serait une pièce d'infrastructure de plus pour
 * rien. Le prix est écrit : les compteurs repartent à zéro au redémarrage, et
 * le jour du second réplica ce fichier migre avec le verrou anti-devinage du
 * back-office (ADR-0006), pas avant.
 *
 * ## Une fenêtre fixe, pas une fenêtre glissante
 *
 * Une fenêtre glissante garderait la trace de chaque tentative pour ne rien
 * gagner ici : ce qu'on veut est « pas plus de N envois d'email dans un quart
 * d'heure », et le pire cas de la fenêtre fixe — 2N envois autour d'une
 * frontière — reste très en dessous de ce qui gêne quelqu'un.
 *
 * ## Pure, et donc testable à l'horloge qu'on lui donne
 *
 * `now` est un argument. C'est ce qui fait de « la fenêtre repart après un
 * quart d'heure » une assertion et non une attente, et c'est la raison pour
 * laquelle ce fichier est dans `domain/` plutôt que dans le service qui s'en
 * sert : il ne lit ni requête, ni base, ni horloge.
 */

/** Un plafond et sa fenêtre. */
export type Quota = {
  /** Combien de fois, au plus, dans une fenêtre. */
  readonly max: number
  readonly windowMs: number
}

export type Limiter = {
  /**
   * Consomme une unité pour cette clé, et dit si elle était disponible.
   *
   * Consomme même quand elle refuse — appeler cette fonction *est* la
   * tentative, et une tentative refusée compte comme les autres.
   */
  take: (key: string, now: number) => boolean
  /** Combien de clés sont suivies. Ce que le balayage doit garder borné. */
  size: () => number
}

/** Une fenêtre en cours pour une clé : quand elle a commencé, ce qu'elle a vu. */
type Window = { startedAt: number; count: number }

export function quotaLimiter(quota: Quota): Limiter {
  const windows = new Map<string, Window>()

  const expired = (window: Window, now: number): boolean =>
    now - window.startedAt >= quota.windowMs

  return {
    take(key, now) {
      // Le balayage est ici plutôt que sur une minuterie : la seule chose qui
      // fasse grandir cette carte est un appel, donc c'est le bon moment pour
      // la faire maigrir, et il n'y a pas de tâche de fond à arrêter. Il coûte
      // un parcours par appel, sur une carte dont la taille est ce qu'il borne.
      for (const [seen, window] of windows) {
        if (expired(window, now)) windows.delete(seen)
      }

      const window = windows.get(key) ?? { startedAt: now, count: 0 }
      windows.set(key, window)

      // Le compteur ne bouge plus une fois le plafond atteint : sinon marteler
      // la porte repousserait la réouverture, et la fenêtre d'un joueur trop
      // impatient serait celle de sa dernière tentative et non de sa première.
      if (window.count >= quota.max) return false

      window.count += 1
      return true
    },

    size: () => windows.size,
  }
}
