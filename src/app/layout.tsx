import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, IBM_Plex_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

import './globals.css'

/**
 * Les deux familles du thème, auto-hébergées par `next/font` : le navigateur
 * n'appelle jamais Google, donc rien du jeu ne dépend d'un tiers au moment de
 * peindre — et la page de la grille, qui est servie depuis un cache partagé,
 * ne peut pas non plus être ralentie par lui.
 *
 * Elles ne sont pas posées sur `<body>` mais exposées en variables CSS, que
 * `globals.css` reprend dans `--font-display` et `--font-mono`. C'est ce qui
 * permet au thème de nommer les familles par leur rôle : un composant écrit
 * `font-mono` parce que la donnée se compte, pas parce qu'elle est en Plex.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  // La variable couvre 200→800 d'un seul fichier : le handoff demande 400, 600,
  // 700 et 800, et une fonte variable les donne toutes sans quatre requêtes.
  weight: 'variable',
  variable: '--font-bricolage',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PPFQ',
  description: 'Le quiz quotidien des parcours footballistiques.',
}

/**
 * Le vert du jeu remonte jusqu'à la barre d'adresse du téléphone, et le
 * sur-défilement ne montre pas une bande blanche sous le bandeau d'action.
 */
export const viewport: Viewport = {
  themeColor: '#2ECB92',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${plexMono.variable}`}>
      {/* Le fond du jeu est porté par le `<body>` et non par la page : c'est la
          seule surface qui couvre aussi le sur-défilement. Le back-office pose
          le sien par-dessus (`bg-neutral-50` sur toute la hauteur), donc il ne
          voit rien de ce vert. */}
      <body className="bg-pitch text-ink font-display min-h-dvh antialiased">{children}</body>
    </html>
  )
}
