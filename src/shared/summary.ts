/**
 * Le résumé partagé : ce qu'un joueur colle dans une conversation à la fin de
 * sa grille.
 *
 * **Rien de tout ceci n'est stocké** (`docs/modele-donnees.md` §9), et c'est la
 * décision dont le fichier entier découle : le résumé se dérive des trois
 * parties et de la grille, à chaque fois, des deux côtés. Il n'a donc pas
 * d'identifiant, il n'y a rien à invalider quand une partie bouge, et l'image
 * OG dynamique — la seule fonctionnalité qui aurait exigé un résumé en base —
 * est écartée de la v1 pour cette raison exacte (`docs/stack-technique.md`
 * §11).
 *
 * ## Des symboles, parce qu'un résumé se colle devant des gens qui n'ont pas
 * encore joué
 *
 * C'est la propriété que ce module doit tenir et la seule qui casse quelque
 * chose d'irréparable : « le résumé ne révèle aucun nom » (specs §8). Une
 * partie terminée *porte* la réponse — `answer` dans `shared/play.ts` — donc le
 * nom est à portée de main ici, et il n'est jamais lu. Le pendant est que ce
 * module ne prend **que** ce qu'il affiche : une date, un thème, et des
 * parties dont il ne regarde que l'issue et le compte.
 *
 * ## La date et non un numéro de grille
 *
 * Une grille est nommée par sa date partout ailleurs — `(date, position)`
 * nomme une énigme sans nommer une ligne (`shared/grid.ts`), et la grille du
 * jour est un `SELECT WHERE date = <aujourd'hui à Paris>`. Un numéro aurait
 * demandé une origine, donc un jour 1 choisi à la main que plus rien n'aurait
 * pu bouger ensuite sans renuméroter tous les résumés déjà partagés.
 */
import { MAX_TRIES } from './play'
import type { EnigmaPlay } from './play'
import { POSITIONS, formatChallengeDate } from './schedule'
import type { ChallengeDate, Position } from './schedule'

/**
 * Les trois symboles, et il n'y en aura jamais un quatrième.
 *
 * Un essai dépensé sans trouver, l'essai qui trouve, un essai jamais joué. Des
 * carrés de couleur plutôt que des lettres : ils survivent au copier-coller
 * dans n'importe quelle messagerie, et ils ne se lisent dans aucune langue.
 */
const SPENT = '🟥'
const FOUND = '🟩'
const UNSPENT = '⬜'

/**
 * Le nom sous lequel un résumé collé est reconnu.
 *
 * La seule chaîne de ce fichier qui relève du produit et non du jeu : c'est ce
 * qu'un lecteur voit avant de comprendre de quoi il s'agit. Le jour où le jeu
 * porte un nom public, ce n'est **pas** le seul endroit à changer — les deux
 * `layout.tsx` le portent aussi, en titre de page et en en-tête du
 * back-office. Il est écrit ici plutôt qu'importé de l'un d'eux parce que ce
 * module est isomorphe et pur : il ne connaît ni Next ni l'arbre des routes.
 */
const GAME_NAME = 'PPFQ'

/** La grille et les parties dont un résumé se dérive — et rien d'autre. */
export type SummarySource = {
  date: ChallengeDate
  theme: string
  /**
   * Les parties du joueur sur cette grille, telles que le serveur les donne.
   *
   * Seules les énigmes réellement ouvertes y sont (`shared/play.ts`) : une
   * énigme jamais dépliée est **absente**, elle n'est pas présente à zéro
   * essai. C'est ce qui rend `isShareable` lisible d'un coup d'œil.
   */
  plays: readonly EnigmaPlay[]
}

/**
 * Y a-t-il quelque chose à partager ?
 *
 * Le garde-fou d'interface de `docs/modele-donnees.md` §8 : « on ne propose le
 * partage que si au moins une partie a été jouée, sinon une grille simplement
 * ouverte produirait un résumé de trois échecs ».
 *
 * **La mesure est l'essai, et surtout pas l'existence de la partie.** Une
 * partie naît à l'ouverture d'une énigme et non au premier essai (CONTEXT.md),
 * donc un joueur qui déplie une carte et la referme a déjà trois parties à
 * zéro essai : compter les parties laisserait passer exactement le cas que
 * cette fonction existe pour refuser. C'est aussi pour ça que « jouée » ne se
 * lit pas ici comme dans les statistiques, où une partie ouverte et abandonnée
 * compte bel et bien (specs §5) — là-bas on mesure une exposition, ici on
 * demande s'il s'est passé quelque chose qui vaille d'être raconté.
 */
export function isShareable(plays: readonly EnigmaPlay[]): boolean {
  return plays.some((play) => play.triesUsed > 0)
}

/**
 * La ligne d'une énigme : six cases, une par essai possible.
 *
 * Toujours six, même quand la partie s'est arrêtée au deuxième essai. Des
 * lignes de longueurs inégales se liraient comme un classement alors qu'elles
 * ne diraient que le nombre d'essais déjà dépensés, et elles perdraient
 * l'échelle qui rend le compte lisible sans le chiffrer.
 *
 * **La défaite ne se compte pas**, et c'est la seule ligne qui n'est pas une
 * addition : une partie perdue est pleine, quoi qu'elle ait dépensé. C'est la
 * règle que `describePlay` tient déjà à l'écran — « une partie perdue en deux
 * essais et une perdue en six disent la même chose » — et une partie
 * abandonnée, que le changement de grille lit comme un échec, dirait sinon en
 * carrés ce que l'interface refuse de dire en mots.
 *
 * `undefined` est l'énigme jamais ouverte, celle dont il n'existe aucune ligne
 * en base. Elle est indistinguable d'une partie ouverte et laissée à zéro
 * essai, et c'est exact : ni l'une ni l'autre n'a été jouée.
 */
export function summaryLine(play: EnigmaPlay | undefined): string {
  if (play === undefined) return UNSPENT.repeat(MAX_TRIES)

  switch (play.status) {
    case 'failed':
      return SPENT.repeat(MAX_TRIES)
    case 'solved':
      // L'essai qui trouve n'est pas une erreur : il en reste `triesUsed - 1`
      // derrière lui (`docs/modele-donnees.md` §8, le tableau des paliers).
      return cells(play.triesUsed - 1, true)
    case 'in_progress':
      return cells(play.triesUsed, false)
  }
}

/** Les erreurs payées, l'essai qui trouve s'il y en a un, puis le reste vide. */
function cells(spent: number, found: boolean): string {
  const head = SPENT.repeat(spent) + (found ? FOUND : '')

  return head + UNSPENT.repeat(MAX_TRIES - spent - (found ? 1 : 0))
}

/**
 * Le résumé entier, prêt à coller : un en-tête, une ligne blanche, trois lignes.
 *
 * **Trois lignes toujours**, parcourues par position et non par les parties
 * jouées : un joueur qui n'a ouvert que le titulaire a une seule partie, et un
 * résumé d'une ligne ferait lire son titulaire comme un échauffement. La
 * position est l'ordre de difficulté (CONTEXT.md), donc c'est elle qui donne
 * son rang à chaque ligne, et jamais l'ordre dans lequel le serveur a répondu.
 */
export function sharedSummary({ date, theme, plays }: SummarySource): string {
  const byPosition = new Map<Position, EnigmaPlay>(plays.map((play) => [play.position, play]))
  const lines = POSITIONS.map((position) => summaryLine(byPosition.get(position)))

  // Le thème est imprimé tel que l'admin l'a tapé : texte libre, propriété de
  // la grille entière, et le code n'en classe ni n'en corrige rien (specs §4).
  return `${GAME_NAME} — ${formatChallengeDate(date)}\nThème : ${theme}\n\n${lines.join('\n')}`
}
