import 'server-only'

import { SIGN_IN_TTL_SECONDS } from '@/shared/account'

import { sendMail } from './mailer'

/**
 * Les deux seuls emails que ce jeu envoie.
 *
 * Ils sont écrits ici, à côté l'un de l'autre, parce qu'ils disent la même
 * chose de deux façons et qu'on ne peut juger ni l'un ni l'autre seul. Deux
 * règles les tiennent :
 *
 * - **le code est lisible sans cliquer**, en clair dans la première ligne, pour
 *   qu'un aperçu de notification suffise à le recopier dans l'onglet où l'on
 *   joue ;
 * - **rien n'y est cliquable dans l'email du code**. C'est ce qui le rend
 *   insensible aux scanners de liens — Outlook SafeLinks, les antivirus mail —
 *   qui préchargent les URL et brûleraient un jeton à usage unique avant le
 *   clic (`docs/stack-technique.md` §4bis).
 *
 * Aucun des deux ne dit si l'adresse avait déjà un compte : s'inscrire et se
 * connecter sont une seule action (specs §6), et la phrase qui les
 * distinguerait dirait à un inconnu qui est inscrit.
 */

const MINUTES = Math.round(SIGN_IN_TTL_SECONDS / 60)

/** Le nom sous lequel le jeu se présente dans une boîte mail. */
const GAME = 'Footguessr'

/**
 * Le code à six chiffres — la voie principale.
 *
 * Il est dans l'objet autant que dans le corps : un code qu'on lit dans la
 * liste des messages est un code qu'on n'a pas à ouvrir, donc un aller-retour
 * de moins entre le client mail et l'onglet du jeu — et c'est tout le sujet,
 * puisque c'est l'onglet du jeu qui porte la progression à reprendre.
 */
export async function sendSignInCode(email: string, code: string): Promise<boolean> {
  return await sendMail({
    to: email,
    subject: `${code} — votre code de connexion ${GAME}`,
    text: [
      `Votre code de connexion : ${code}`,
      '',
      `Saisissez-le dans l’onglet où vous jouez. Il est valable ${MINUTES} minutes et ne sert qu’une fois.`,
      '',
      'Si vous n’avez rien demandé, ignorez ce message : rien n’a été créé, et personne ne peut entrer sans ce code.',
    ].join('\n'),
  })
}

/**
 * Le lien magique — le raccourci de ceux qui sont sur le même appareil.
 *
 * L'URL ne consomme rien : elle mène à une page qui demande de confirmer, et
 * c'est la confirmation qui ouvre la session. L'email le dit, parce qu'une
 * page qui redemande après qu'on a déjà cliqué ressemble sinon à une panne.
 */
export async function sendSignInLink(email: string, url: string): Promise<boolean> {
  return await sendMail({
    to: email,
    subject: `Votre lien de connexion ${GAME}`,
    text: [
      'Pour vous connecter, ouvrez ce lien puis confirmez sur la page qui s’affiche :',
      '',
      url,
      '',
      `Le lien est valable ${MINUTES} minutes et ne sert qu’une fois.`,
      '',
      'Si vous jouiez dans un autre navigateur, préférez le code à six chiffres : tapé dans l’onglet du jeu, il garde la partie en cours sous les yeux.',
      '',
      'Si vous n’avez rien demandé, ignorez ce message.',
    ].join('\n'),
  })
}
