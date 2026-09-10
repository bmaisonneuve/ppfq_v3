import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'PPFQ',
  description: 'Le quiz quotidien des parcours footballistiques.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
