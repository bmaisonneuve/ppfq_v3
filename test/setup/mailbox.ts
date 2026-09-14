/**
 * La boîte mail du développement, lue par les tests.
 *
 * Sans mot de passe, **l'email est le chemin de connexion**
 * (`docs/stack-technique.md` §4bis) : un code qu'on ne peut pas lire est une
 * connexion qu'on ne peut pas exercer. Et il n'y a pas de raccourci — le code
 * est haché en base exprès, donc la seule façon honnête de le connaître est
 * celle du joueur : ouvrir le message.
 *
 * D'où Mailpit dans `docker-compose.yml`, démarré par `pnpm test` comme la base
 * l'est déjà. Ce que ça achète est le chemin entier — la demande, le rendu du
 * message, le relais SMTP, le code tel qu'il arrive — au lieu d'un test qui
 * s'arrête à l'appel d'une fonction d'envoi.
 */
import { SIGN_IN_CODE_LENGTH } from '@/shared/account'

/** Là où Mailpit écoute. Le défaut correspond à `docker-compose.yml`. */
const MAILBOX_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025'

type MailpitSummary = { ID: string; To: { Address: string }[] }
type MailpitMessage = { Subject: string; Text: string }

/** Un message, réduit à ce qu'un test en lit. */
export type Mail = { subject: string; text: string }

/**
 * Vide la boîte.
 *
 * Appelée par chaque test qui envoie, et pas une fois pour toutes : la boîte
 * est partagée par tous les fichiers du projet `postgres`, qui tournent en
 * série mais laissent chacun leurs messages derrière eux.
 */
export async function clearMailbox(): Promise<void> {
  const response = await fetch(`${MAILBOX_URL}/api/v1/messages`, { method: 'DELETE' })
  if (!response.ok) throw mailboxDown(response.status)
}

/**
 * Le dernier message reçu à cette adresse — en attendant qu'il arrive.
 *
 * L'attente n'est pas de la prudence : l'envoi SMTP est terminé du point de vue
 * de l'application avant que Mailpit n'ait fini d'indexer le message, et un
 * test qui lirait tout de suite serait vert ou rouge selon la charge de la
 * machine.
 */
export async function mailTo(address: string, attempts = 50): Promise<Mail> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const found = await latestTo(address)
    if (found !== null) return found
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Aucun message pour ${address} après ${attempts} tentatives.`)
}

/** Combien de messages attendent cette adresse. Zéro est une réponse. */
export async function mailCountTo(address: string): Promise<number> {
  return (await summaries()).filter((mail) => addressedTo(mail, address)).length
}

/**
 * Le code à six chiffres, tel qu'un joueur le recopie.
 *
 * Lu dans le corps et pas dans l'objet, bien qu'il soit dans les deux : ce que
 * le test doit vérifier est ce qu'on lit en ouvrant le message.
 */
export function codeIn(mail: Mail): string {
  const found = new RegExp(`\\b\\d{${SIGN_IN_CODE_LENGTH}}\\b`, 'u').exec(mail.text)
  if (found === null) throw new Error(`Pas de code à six chiffres dans :\n${mail.text}`)
  return found[0]
}

/** L'URL du lien magique, telle qu'elle est cliquée. */
export function linkIn(mail: Mail): string {
  const found = /https?:\/\/\S+/u.exec(mail.text)
  if (found === null) throw new Error(`Pas de lien dans :\n${mail.text}`)
  return found[0]
}

async function latestTo(address: string): Promise<Mail | null> {
  const matching = (await summaries()).filter((mail) => addressedTo(mail, address))
  const latest = matching[0]
  if (latest === undefined) return null

  const response = await fetch(`${MAILBOX_URL}/api/v1/message/${latest.ID}`)
  if (!response.ok) throw mailboxDown(response.status)

  const message = (await response.json()) as MailpitMessage
  return { subject: message.Subject, text: message.Text }
}

/** Les messages, le plus récent d'abord — l'ordre que Mailpit rend. */
async function summaries(): Promise<MailpitSummary[]> {
  const response = await fetch(`${MAILBOX_URL}/api/v1/messages?limit=200`)
  if (!response.ok) throw mailboxDown(response.status)

  return ((await response.json()) as { messages: MailpitSummary[] }).messages
}

const addressedTo = (mail: MailpitSummary, address: string): boolean =>
  mail.To.some((to) => to.Address.toLowerCase() === address.toLowerCase())

const mailboxDown = (status: number): Error =>
  new Error(
    `Mailpit à ${MAILBOX_URL} a répondu ${status}. Est-il démarré ? ` +
      '`docker compose up -d --wait mailpit`',
  )
