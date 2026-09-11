import { describe, expect, it } from 'vitest'

import { MAX_TRIES } from '@/shared/play'
import type { EnigmaPlay, PlayStatus } from '@/shared/play'
import type { Position } from '@/shared/schedule'
import { isShareable, sharedSummary, summaryLine } from '@/shared/summary'

/**
 * Le résumé partagé — la moitié isomorphe du ticket, et la seule qui décide.
 *
 * Rien n'est stocké (`docs/modele-donnees.md` §9) : le résumé se dérive des
 * trois parties et de la grille, donc tout ce qu'un joueur colle dans une
 * conversation est affirmé ici. Deux familles de bêtises sont possibles, et
 * elles ne coûtent pas la même chose :
 *
 * - **en dire trop.** Un nom de footballeur dans le résumé, et le jeu est fini
 *   pour tous ceux qui lisent le message. C'est la propriété qui justifie que
 *   le résumé soit des symboles et non des mots ;
 * - **en dire faux.** Un essai de trop ou de moins sur une ligne, et le joueur
 *   se vante ou se dévalorise sans pouvoir s'en rendre compte : personne ne
 *   recompte une ligne de carrés.
 */
const play = (over: Partial<EnigmaPlay> & { status: PlayStatus }): EnigmaPlay => ({
  position: 1,
  triesUsed: 0,
  hints: [],
  answer: null,
  ...over,
})

const at = (position: Position, over: Partial<EnigmaPlay> & { status: PlayStatus }): EnigmaPlay =>
  play({ ...over, position })

/**
 * Une ligne bien formée : exactement six cases, et rien que les trois symboles.
 *
 * Les deux propriétés en une expression, et mesurées par un motif plutôt qu'en
 * découpant la chaîne : un carré de couleur n'est pas un caractère JavaScript,
 * et compter des unités UTF-16 ferait passer six cases pour douze.
 */
const WELL_FORMED = /^[\u{1F7E5}\u{1F7E9}\u{2B1C}]{6}$/u

/** Les trois lignes de symboles, l'en-tête retiré. */
const symbolLines = (summary: string): string[] => (summary.split('\n\n')[1] ?? '').split('\n')

describe('la ligne d’une énigme', () => {
  it('a toujours six cases, une par essai possible', () => {
    // Des lignes de longueurs inégales se lisent comme un classement, alors
    // qu'elles ne diraient que le nombre d'essais déjà consommés.
    const lines = [
      summaryLine(undefined),
      summaryLine(play({ status: 'in_progress', triesUsed: 3 })),
      summaryLine(play({ status: 'solved', triesUsed: 1 })),
      summaryLine(play({ status: 'failed', triesUsed: MAX_TRIES })),
    ]

    expect(lines.every((line) => WELL_FORMED.test(line))).toBe(true)
  })

  it('n’est que des carrés vides pour une énigme jamais ouverte', () => {
    // Une énigme jamais ouverte n'a pas de partie du tout : elle est absente de
    // la réponse du serveur, et c'est ce `undefined` qui arrive ici.
    expect(summaryLine(undefined)).toBe('⬜⬜⬜⬜⬜⬜')
  })

  it('compte les erreurs payées puis marque l’essai qui trouve', () => {
    // Trouvé au troisième : deux erreurs, et le troisième est la réussite.
    expect(summaryLine(play({ status: 'solved', triesUsed: 3 }))).toBe('🟥🟥🟩⬜⬜⬜')
  })

  it('n’a pas de case vide quand la réussite arrive au dernier essai', () => {
    expect(summaryLine(play({ status: 'solved', triesUsed: MAX_TRIES }))).toBe('🟥🟥🟥🟥🟥🟩')
  })

  it('est une réussite seule quand elle arrive du premier coup', () => {
    expect(summaryLine(play({ status: 'solved', triesUsed: 1 }))).toBe('🟩⬜⬜⬜⬜⬜')
  })

  it('montre les essais déjà consommés d’une partie en cours', () => {
    expect(summaryLine(play({ status: 'in_progress', triesUsed: 2 }))).toBe('🟥🟥⬜⬜⬜⬜')
  })

  it('est pleine pour une partie perdue, quel que soit ce qu’elle a dépensé', () => {
    // La même règle que `describePlay` : une défaite ne se compte pas. Une
    // partie abandonnée que le changement de grille lit comme un échec dirait
    // sinon, en carrés, ce que l'écran refuse de dire en mots.
    const exhausted = summaryLine(play({ status: 'failed', triesUsed: MAX_TRIES }))

    expect(exhausted).toBe('🟥🟥🟥🟥🟥🟥')
    expect(summaryLine(play({ status: 'failed', triesUsed: 2 }))).toBe(exhausted)
  })

  it('reste bien formée pour tous les comptes d’essais possibles', () => {
    // La matrice entière : trois issues par nombre d'essais, jusqu'au sixième.
    // C'est le seam pur qui la rend gratuite (`vitest.config.ts`).
    const lines = Array.from({ length: MAX_TRIES }, (_, index) => index + 1).flatMap(
      (triesUsed) => [
        summaryLine(play({ status: 'solved', triesUsed })),
        summaryLine(play({ status: 'failed', triesUsed })),
        summaryLine(play({ status: 'in_progress', triesUsed })),
      ],
    )

    expect(lines.every((line) => WELL_FORMED.test(line))).toBe(true)
  })
})

describe('le résumé entier', () => {
  const summary = sharedSummary({
    date: '2026-09-09',
    theme: 'rétro',
    plays: [
      at(1, { status: 'solved', triesUsed: 3 }),
      at(2, { status: 'solved', triesUsed: 6 }),
      at(3, { status: 'failed', triesUsed: 6 }),
    ],
  })

  it('annonce la date de la grille et son thème en en-tête', () => {
    // La date et non un numéro : une grille est nommée par sa date partout
    // ailleurs dans le modèle, et un numéro aurait demandé une origine à
    // choisir, donc un jour 1 arbitraire à ne jamais bouger.
    const [header = ''] = summary.split('\n\n')

    expect(header).toContain('mercredi 9 septembre 2026')
    expect(header).toContain('rétro')
  })

  it('fait trois lignes de symboles, une par position, dans l’ordre', () => {
    expect(symbolLines(summary)).toEqual(['🟥🟥🟩⬜⬜⬜', '🟥🟥🟥🟥🟥🟩', '🟥🟥🟥🟥🟥🟥'])
  })

  it('garde ses trois lignes quand une énigme n’a jamais été ouverte', () => {
    // Le joueur n'a ouvert que le titulaire. La grille en a trois, et une ligne
    // manquante ferait lire son titulaire comme un échauffement.
    const partial = sharedSummary({
      date: '2026-09-09',
      theme: 'standard',
      plays: [at(2, { status: 'solved', triesUsed: 2 })],
    })

    expect(symbolLines(partial)).toEqual(['⬜⬜⬜⬜⬜⬜', '🟥🟩⬜⬜⬜⬜', '⬜⬜⬜⬜⬜⬜'])
  })

  it('ne contient aucun nom de footballeur, même partie terminée', () => {
    // La partie terminée porte la réponse (`shared/play.ts`), et c'est le seul
    // endroit du jeu où un nom est à portée de main du client. Le résumé est
    // fait pour être collé devant des gens qui n'ont pas encore joué.
    const named = sharedSummary({
      date: '2026-09-09',
      theme: 'standard',
      plays: [
        at(1, { status: 'solved', triesUsed: 2, answer: 'Zinédine Zidane' }),
        at(2, { status: 'failed', triesUsed: 6, answer: 'Jean-Pierre Papin' }),
      ],
    })

    expect(named).not.toContain('Zidane')
    expect(named).not.toContain('Papin')
  })

  it('annonce le thème tel qu’il a été tapé', () => {
    // Texte libre, propriété de la grille entière (specs §4) : le code ne
    // classe rien et ne corrige rien, ici pas plus qu'à l'écran.
    const custom = sharedSummary({
      date: '2026-09-09',
      theme: 'Finale de Coupe',
      plays: [at(1, { status: 'solved', triesUsed: 1 })],
    })

    expect(custom).toContain('Finale de Coupe')
  })
})

describe('le garde-fou du partage', () => {
  it('ne propose rien à qui n’a pas touché à la grille', () => {
    expect(isShareable([])).toBe(false)
  })

  it('ne propose rien d’une grille seulement dépliée', () => {
    // Le cas que le garde-fou existe pour refuser : « une grille simplement
    // ouverte produirait un résumé de trois échecs »
    // (`docs/modele-donnees.md` §8). Une partie naît à l'ouverture d'une
    // énigme et non au premier essai, donc ouvrir les trois cartes et les
    // refermer donne bien trois parties — et rien à raconter.
    const unfolded = [
      at(1, { status: 'in_progress', triesUsed: 0 }),
      at(2, { status: 'in_progress', triesUsed: 0 }),
      at(3, { status: 'in_progress', triesUsed: 0 }),
    ]

    expect(isShareable(unfolded)).toBe(false)
  })

  it('propose dès qu’un seul essai a été consommé', () => {
    // Un essai suffit, et il n'a pas besoin d'avoir trouvé : tout en consomme
    // un — une erreur, un doublon, un tour passé (CONTEXT.md).
    expect(isShareable([at(2, { status: 'in_progress', triesUsed: 1 })])).toBe(true)
  })

  it('propose sur une partie terminée, même perdue', () => {
    expect(isShareable([at(3, { status: 'failed', triesUsed: MAX_TRIES })])).toBe(true)
  })
})
