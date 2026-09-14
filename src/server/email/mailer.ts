import 'server-only'

import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

/**
 * L'envoi d'un email, et rien d'autre.
 *
 * Sans mot de passe, **l'email est le chemin de connexion** : un email qui
 * n'arrive pas n'est pas une gêne, c'est l'impossibilité de se connecter
 * (`docs/stack-technique.md` §4bis). Ce fichier est donc le morceau le plus
 * ennuyeux et le plus critique du compte, et il ne fait qu'une chose.
 *
 * ## Un relais SMTP authentifié, et jamais le SMTP de la machine
 *
 * La règle du §4bis est « jamais le SMTP du VPS » : une IP fraîche part en
 * spam, et Hetzner ferme le port 25 sur les nouveaux comptes. Ce que lit
 * `MAIL_SMTP_URL` est donc toujours un **relais d'un fournisseur** — Scaleway
 * TEM en production (`fr-par`, données et journaux en UE), Mailpit en
 * développement et sous test.
 *
 * Un seul chemin de code pour les deux, et c'est délibéré : le jour où l'email
 * ne part pas en production, ce qui a été exercé mille fois en local est
 * exactement ce qui tourne là-bas. L'API HTTP de Scaleway reste à faire pour ce
 * que SMTP ne sait pas dire — le statut d'un envoi, les rebonds, `email_events`
 * — et c'est le sujet d'un autre ticket, pas de celui-ci.
 *
 * ## Sans variable, rien ne part, et la porte se ferme
 *
 * Le même arbitrage qu'ADR-0006 : un déploiement dont la variable manque doit
 * échouer **du côté qui n'envoie pas**, visiblement, plutôt que d'avaler
 * silencieusement des demandes de connexion. `sendMail` répond `false`, le
 * service le traduit en refus, et le joueur lit « l'email n'a pas pu être
 * envoyé » au lieu d'attendre un code qui n'existe pas.
 */

const SMTP_URL_VAR = 'MAIL_SMTP_URL'
const FROM_VAR = 'MAIL_FROM'

/** L'expéditeur par défaut — celui du développement, où le domaine est sans objet. */
const DEFAULT_FROM = 'Footguessr <jeu@localhost>'

export type Mail = {
  to: string
  subject: string
  /** Texte seul : un code à six chiffres et un lien n'ont pas besoin de HTML. */
  text: string
}

/**
 * Envoie, et dit si c'est parti.
 *
 * Ne lève pas. Un fournisseur d'email injoignable est un incident d'exploitation
 * banal, et il ne doit pas remonter en 500 sur une porte publique : l'appelant
 * a une phrase à afficher, et elle est la même quelle que soit la panne.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const transporter = transport()
  if (transporter === null) return false

  try {
    await transporter.sendMail({ from: from(), ...mail })
    return true
  } catch (error) {
    // Le message, jamais la pile, et jamais le contenu : ce corps-là porte un
    // code de connexion valide pendant dix minutes.
    console.error(`[mail] envoi refusé : ${String(error)}`)
    return false
  }
}

/**
 * Le transport, fabriqué une fois et gardé — mais gardé **pour une URL**.
 *
 * Nodemailer garde un pool de connexions derrière : en refabriquer un par email
 * rouvrirait une connexion SMTP à chaque demande de code. Il est fabriqué à
 * l'appel et non au chargement du module, pour la raison qui vaut déjà pour
 * `db/client.ts` — `next build` évalue chaque route sans avoir l'environnement.
 *
 * La mémoire est indexée par l'URL et non posée une fois pour toutes : sinon la
 * valeur lue au tout premier envoi survivrait à tout changement, ce qui est un
 * piège en exploitation et rend l'échec d'envoi impossible à exercer sous test.
 */
let cached: { url: string; transporter: Transporter } | undefined

function transport(): Transporter | null {
  const url = process.env[SMTP_URL_VAR] ?? ''

  if (url === '') {
    console.error(`[mail] ${SMTP_URL_VAR} n’est pas défini : aucun email ne part.`)
    return null
  }

  if (cached?.url !== url) cached = { url, transporter: createTransport(url) }

  return cached.transporter
}

function from(): string {
  const configured = process.env[FROM_VAR] ?? ''
  return configured === '' ? DEFAULT_FROM : configured
}
