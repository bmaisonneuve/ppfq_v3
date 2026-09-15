import { notFound } from 'next/navigation'

import { asPosition } from '@/shared/schedule'
import { ChallengeScreen } from '@/ui/game/challenge-screen'

/**
 * Un niveau d'une journée passée : `/archive/2026-09-08/2`.
 *
 * La date puis le rang, et l'adresse se lit d'elle-même. C'est ce que la page
 * des niveaux du jour annonçait : « l'archive, quand elle existera, portera sa
 * date dans un segment à elle » — le rang seul suffit à nommer un niveau du
 * jour parce que l'horloge a déjà décidé de la journée, et il ne suffit plus
 * dès que la journée est un choix.
 *
 * Aucun `generateStaticParams` ici, et c'est la conséquence assumée de
 * l'ADR-0008 : une route statique par date prérendrait autant de pages au
 * build, et ce qu'elles montrent dépend de qui regarde de toute façon. Ces
 * pages-là sont rendues à la demande et cachées par personne.
 */
export default async function ArchiveChallengePage({
  params,
}: Readonly<{ params: Promise<{ position: string }> }>) {
  const { position } = await params
  const at = asPosition(Number(position))

  if (at === null) notFound()

  return <ChallengeScreen position={at} />
}
