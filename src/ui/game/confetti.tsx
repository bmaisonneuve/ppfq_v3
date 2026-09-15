'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * La gerbe : l'écran entier, depuis son centre.
 *
 * Le seul élément purement décoratif du jeu, et il est gradué — c'est ce qui le
 * sauve d'être un gadget. Une énigme trouvée au cinquième essai n'a pas la même
 * gerbe qu'une énigme trouvée du premier coup, et c'est la seule différence
 * entre les deux célébrations : pas une couleur de plus, pas un texte de plus.
 *
 * Un fichier à part et non un bout de `verdict.tsx` : celui-ci calcule le
 * verdict et le dit à voix haute, deux choses que la fête ne touche pas. Ce
 * qu'elle a de commun avec lui tient en une ligne — elle est montée tant que
 * l'instant dure, et démontée avec lui (`useLive`).
 *
 * ## Elle est posée sur la fenêtre, et pas dans la carte réponse
 *
 * Deux raisons, et la première est un mur : le corps de l'écran défile
 * (`chrome.tsx`), donc c'est une boîte à débordement, et **rien n'en sort**.
 * Une gerbe lancée depuis la carte était rognée aux bords de la zone de
 * lecture, ce qui la réduisait à une poignée de carrés autour du nom. La
 * seconde est qu'elle partait alors de la pastille de la carte, c'est-à-dire ni
 * du centre de l'écran ni même du centre de la carte.
 *
 * `fixed` la sort des deux d'un coup — mais seulement tant qu'aucun ancêtre ne
 * porte de `transform`, qui en ferait le repère à la place de la fenêtre. C'est
 * pour cela qu'elle est montée par l'écran, à côté de la colonne, et surtout
 * pas dans la carte réponse : celle-ci est en train de se poser, donc elle est
 * transformée exactement pendant que la gerbe part.
 *
 * Les distances sont en `vw` et `vh` : la gerbe doit couvrir un téléphone comme
 * un écran de 27 pouces, et des pixels auraient fait un feu d'artifice de
 * timbre-poste sur le second.
 *
 * Deux éléments par éclat, et il en faut deux : l'horizontale est linéaire,
 * la verticale monte puis retombe. C'est un millier d'éléments pour la plus
 * grosse gerbe, et c'est tenable parce qu'ils ne font que ça : deux `transform`
 * et une `opacity`, aucune mise en page à recalculer, et tout est démonté avec
 * l'instant — `useLive` redessine l'écran à la fin de la fenêtre, et la gerbe
 * s'en va avec lui. Une seule animation ne sait pas faire un arc — elle
 * interpole en ligne droite — et un confetti qui part en ligne droite se lit
 * comme un rayon de soleil.
 */
export function Confetti({ double = false }: Readonly<{ double?: boolean }>) {
  // Tiré une fois : un rendu de plus ne doit pas redistribuer les éclats en
  // plein vol. Le composant n'existe que côté client — il n'apparaît qu'après
  // un essai — donc le hasard ne peut pas contredire un rendu serveur.
  const [bits] = useState(() => scatter(double ? 520 : 300))

  // Coupé net plutôt qu'accéléré : la règle générale de `globals.css` ramène
  // toutes les durées à 1 ms, ce qui ferait clignoter cinq cents carrés pendant
  // une image. Ici il n'y a rien à dégrader — c'est de la décoration pure.
  const [still] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED).matches,
  )

  if (still) return null

  return (
    <span
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {/* Le point d'où tout part : le centre de la fenêtre, remonté d'un
          cheveu — une gerbe centrée à la moitié exacte paraît basse, le regard
          plaçant le centre d'une image au-dessus de son milieu. */}
      <span className="absolute top-[46%] left-1/2">
        {bits.map((bit, index) => (
          <span
            key={index}
            className="animate-drift-x absolute block"
            style={{ '--dx': bit.dx, animationDelay: bit.delay } as CSSProperties}
          >
            <span
              className={`animate-drift-y block ${bit.round ? 'rounded-full' : 'rounded-[1px]'}`}
              style={
                {
                  '--lift': bit.lift,
                  '--fall': bit.fall,
                  '--spin': bit.spin,
                  width: bit.width,
                  height: bit.height,
                  background: bit.color,
                  animationDelay: bit.delay,
                } as CSSProperties
              }
            />
          </span>
        ))}
      </span>
    </span>
  )
}

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Les trois couleurs du jeu, et aucune quatrième inventée pour la fête. */
const CONFETTI_COLORS = ['var(--color-pitch)', 'var(--color-ink)', 'var(--color-found)'] as const

/**
 * Les éclats, tirés une fois.
 *
 * L'étalement compte autant que le nombre : des départs échelonnés sur trois
 * dixièmes de seconde et des distances très inégales font une éruption, là où
 * cinq cents carrés partis ensemble à la même vitesse font une fleur. Les
 * portées vont jusqu'aux bords — une moitié de fenêtre de large, une fenêtre
 * entière de haut — parce qu'une gerbe qui s'arrête avant le bord dessine son
 * propre cercle au milieu de l'écran.
 *
 * Deux tiers de rubans et un tiers de disques : un confetti réel est un bout de
 * papier oblong, et cent carrés parfaits se lisent comme des pixels.
 */
function scatter(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const size = 5 + Math.round(rand() * 7)
    const round = rand() < 0.32

    return {
      dx: `${Math.round((rand() * 2 - 1) * 62)}vw`,
      lift: `${-Math.round(18 + rand() * 52)}vh`,
      fall: `${Math.round(45 + rand() * 75)}vh`,
      spin: `${Math.round((rand() * 2 - 1) * 900)}deg`,
      delay: `${Math.round(rand() * 320)}ms`,
      width: `${size}px`,
      height: `${round ? size : Math.round(size * 0.55)}px`,
      round,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? CONFETTI_COLORS[0],
    }
  })
}

/** La trajectoire d'un confetti, qui n'a rien d'un secret à protéger. */
// eslint-disable-next-line sonarjs/pseudo-random
const rand = (): number => Math.random()
