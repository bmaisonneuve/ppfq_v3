import { notFound } from 'next/navigation'

import { POSITIONS, asPosition } from '@/shared/schedule'
import { ChallengeScreen } from '@/ui/game/challenge-screen'

/**
 * Un niveau de la journée, à son adresse : `/1`, `/2`, `/3`.
 *
 * Une URL par niveau, et c'est ce qui la rend partageable — « regarde le
 * titulaire d'aujourd'hui » se colle dans une conversation, se met en favori et
 * remonte dans l'historique du navigateur. Le rang suffit à la nommer parce
 * qu'une journée est déjà décidée par l'horloge : la grille du jour est celle
 * de la date parisienne, et l'archive, quand elle existera (#11), portera sa
 * date dans un segment à elle.
 *
 * `params` n'est pas une donnée de requête : c'est le segment de route, connu
 * à la construction. Les trois pages sont donc prérendues comme l'accueil et
 * servies depuis le même cache partagé — un joueur qui arrive directement sur
 * `/2` à minuit une ne coûte rien à l'origine.
 */
export const revalidate = 60

/**
 * Les trois seules valeurs, et rien d'autre.
 *
 * `dynamicParams = false` ferme la porte : `/4` ou `/titulaire` répondent 404
 * au lieu d'être rendus à la demande, ce qui garderait la route dynamique pour
 * un chemin que personne n'a écrit.
 */
export const dynamicParams = false

export function generateStaticParams(): { position: string }[] {
  return POSITIONS.map((position) => ({ position: String(position) }))
}

export default async function ChallengePage({
  params,
}: Readonly<{ params: Promise<{ position: string }> }>) {
  const { position } = await params
  const at = asPosition(Number(position))

  if (at === null) notFound()

  return <ChallengeScreen position={at} />
}
