'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ACCOUNT_REFUSALS,
  ACCOUNT_REQUEST_PATH,
  ACCOUNT_SIGN_IN_PATH,
  ACCOUNT_SIGN_OUT_PATH,
  ACCOUNT_STATE_PATH,
} from '@/shared/account'
import type { AccountOutcome, AccountState } from '@/shared/account'

import { personalPost } from './use-day-plays'

/**
 * Le compte, vu de l'onglet où l'on joue.
 *
 * Tout passe par **la file de `useDayPlays`**, et ce n'est pas de la symétrie :
 * la connexion repose le cookie du joueur — la reprise de progression vient
 * peut-être de désigner une autre ligne `players` que celle du cookie présenté,
 * celle qui portait la partie — et une requête d'état qui reviendrait après
 * elle reposerait l'ancienne. Une file, une identité (ADR-0009).
 *
 * ## Deux temps, et le second ne quitte pas l'onglet
 *
 * C'est tout le sujet du code à six chiffres. Le lien magique s'ouvre dans le
 * navigateur du client mail, qui n'a pas le cookie ; le code se recopie ici,
 * sous les yeux de la grille en cours. L'interface propose donc le code
 * d'abord, et le lien comme un second choix explicite.
 *
 * ## Ce qui est relu après une connexion
 *
 * Rien, et c'est voulu : la reprise de progression ne déplace aucune partie —
 * c'est un `UPDATE players SET auth_user_id` (ADR-0003) — donc l'état affiché
 * était déjà celui du bon joueur. Sauf quand le joueur du compte n'est **pas**
 * celui de l'onglet : l'appelant le sait par le changement d'adresse, et c'est
 * lui qui décide de recharger.
 */

/** Où en est le panneau : ce qu'il affiche, et ce qu'il attend. */
export type AccountPanel =
  /** On n'a pas encore demandé qui est connecté. */
  | { step: 'loading' }
  /** Personne, ou plus personne : on demande une adresse. */
  | { step: 'email'; error: string | null }
  /** La demande est partie : on attend les six chiffres. */
  | { step: 'code'; email: string; error: string | null; sentLink: boolean }
  /** Quelqu'un. */
  | {
      step: 'signed-in'
      email: string
      /**
       * Vrai quand cette adresse ouvre le back-office, et ce qui décide est le
       * serveur : le champ vient tel quel de `AccountState`. Le jeu ne connaît
       * pas `ADMIN_EMAILS` et ne doit pas — la page du jeu est prérendue et
       * partagée par un cache, donc elle ne peut rien savoir de qui la regarde.
       *
       * Il ne sert qu'à dessiner un lien. La porte est `requireAdmin()`, côté
       * serveur, sur chaque page et chaque action du back-office.
       */
      admin: boolean
    }

export type Account = {
  panel: AccountPanel
  /**
   * L'initiale à afficher dans la barre d'en-tête, ou rien.
   *
   * Une initiale et pas l'adresse : la barre a trente pixels, et c'est la seule
   * chose qu'on ait à montrer de quelqu'un — le compte ne porte pas de nom
   * (`users.name` reste vide, personne ne le demande).
   */
  initial: string | undefined
  /** Vrai tant qu'une requête du compte est en vol : ce qui désactive un bouton. */
  busy: boolean
  /** Demande un code, ou un lien, pour cette adresse. */
  request: (email: string, via: 'code' | 'link') => void
  /** Présente le code reçu. */
  signIn: (code: string) => void
  signOut: () => void
  /** Revenir à la saisie d'adresse depuis l'attente du code. */
  changeEmail: () => void
}

export function useAccount(enqueue: (task: () => Promise<void>) => void): Account {
  const [panel, setPanel] = useState<AccountPanel>({ step: 'loading' })
  const [busy, setBusy] = useState(false)
  // La lecture d'ouverture, une fois. React exécute un effet deux fois en
  // développement.
  const started = useRef(false)

  /**
   * Une action du panneau : dans la file, et son échec dit quelque chose.
   *
   * Un refus — mauvais code, trop de demandes — n'est pas un échec : il arrive
   * dans un 200 et l'appelant le lit. Ce qui atterrit ici est une panne — hors
   * ligne, un 500 — et la pire réponse serait un bouton qui se réactive sans
   * rien dire, parce qu'elle se confond avec « votre code est faux ».
   */
  const run = useCallback(
    (task: () => Promise<void>): void => {
      setBusy(true)
      enqueue(async () => {
        try {
          await task()
        } catch {
          setPanel(brokenDown)
        } finally {
          setBusy(false)
        }
      })
    },
    [enqueue],
  )

  useEffect(() => {
    if (started.current) return
    started.current = true

    // Derrière l'état et les statistiques, comme tout le reste : la première
    // requête est celle qui établit l'identité, et celle-ci la porte.
    enqueue(async () => {
      try {
        const account = await personalPost<AccountState>(ACCOUNT_STATE_PATH)
        setPanel(signedInOr(account, { step: 'email', error: null }))
      } catch {
        // Ne pas savoir qui est connecté n'empêche pas de jouer, et le panneau
        // n'est ouvert que si on le demande : la saisie d'adresse est la bonne
        // réponse, et une tentative de connexion dira ce qui ne va pas.
        setPanel({ step: 'email', error: null })
      }
    })
  }, [enqueue])

  const request = useCallback(
    (email: string, via: 'code' | 'link'): void => {
      run(async () => {
        const outcome = await personalPost<AccountOutcome>(ACCOUNT_REQUEST_PATH, { email, via })

        // Le passage à l'attente du code a lieu même sur un refus de fréquence
        // : l'adresse est bonne, et renvoyer à la saisie ferait retaper une
        // adresse que le serveur a déjà acceptée.
        setPanel({
          step: 'code',
          email,
          error: outcome.ok ? null : ACCOUNT_REFUSALS[outcome.refusal],
          sentLink: outcome.ok && via === 'link',
        })
      })
    },
    [run],
  )

  const signIn = useCallback(
    (code: string): void => {
      const email = emailOf(panel)
      if (email === null) return

      run(async () => {
        const outcome = await personalPost<AccountOutcome>(ACCOUNT_SIGN_IN_PATH, { email, code })

        setPanel(
          outcome.ok
            ? signedInOr(outcome.account, { step: 'email', error: null })
            : { step: 'code', email, error: ACCOUNT_REFUSALS[outcome.refusal], sentLink: false },
        )
      })
    },
    [panel, run],
  )

  const signOut = useCallback((): void => {
    run(async () => {
      await personalPost<AccountState>(ACCOUNT_SIGN_OUT_PATH)
      setPanel({ step: 'email', error: null })
    })
  }, [run])

  const changeEmail = useCallback((): void => {
    setPanel({ step: 'email', error: null })
  }, [])

  return {
    panel,
    initial: panel.step === 'signed-in' ? panel.email.slice(0, 1) : undefined,
    busy,
    request,
    signIn,
    signOut,
    changeEmail,
  }
}

/** Une panne, dite là où l'écran peut l'afficher, sans perdre l'adresse saisie. */
function brokenDown(current: AccountPanel): AccountPanel {
  const message = 'La connexion au serveur a échoué. Réessayez dans un instant.'

  if (current.step === 'code') return { ...current, error: message, sentLink: false }
  return { step: 'email', error: message }
}

/** Connecté si le serveur nomme quelqu'un, et sinon l'écran donné. */
function signedInOr(account: AccountState, otherwise: AccountPanel): AccountPanel {
  if (account === null) return otherwise

  // `admin` est absent pour tout le monde sauf un admin (`shared/account.ts`) :
  // c'est ici qu'il redevient un booléen, une fois franchie la frontière où son
  // absence voulait dire quelque chose.
  return { step: 'signed-in', email: account.email, admin: account.admin === true }
}

/** L'adresse en cours de vérification, quand il y en a une. */
function emailOf(panel: AccountPanel): string | null {
  return panel.step === 'code' ? panel.email : null
}
