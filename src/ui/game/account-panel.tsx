'use client'

import Link from 'next/link'
import { useState } from 'react'

import { SignInCodeField } from '@/ui/sign-in-code-field'

import type { Account, AccountPanel } from './use-account'

/**
 * Ce que la fenêtre du compte montre — et l'ordre dans lequel elle le montre
 * est la décision, pas le dessin.
 *
 * **Le code à six chiffres est proposé en premier et le lien en second**, ce
 * qui est contre-intuitif et vient tout droit de `docs/stack-technique.md`
 * §4bis : le lien est cliqué dans le client mail, qui ouvre souvent un autre
 * navigateur, et le cookie qui porte la partie en cours reste de ce côté-ci.
 * Un code se recopie ici, sans quitter l'onglet. Le lien reste offert, et le
 * texte dit à qui il s'adresse — ceux qui lisent leur mail sur cet appareil.
 *
 * Rien ici ne dit si l'adresse avait déjà un compte : s'inscrire et se
 * connecter sont une seule action (specs §6), donc l'écran n'a qu'un chemin.
 */
export function AccountPanelView({ account }: Readonly<{ account: Account }>) {
  const { panel } = account

  switch (panel.step) {
    case 'loading':
      return <Note>Un instant…</Note>
    case 'signed-in':
      return <SignedIn account={account} email={panel.email} admin={panel.admin} />
    case 'code':
      return <CodeStep account={account} panel={panel} />
    case 'email':
      return <EmailStep account={account} error={panel.error} />
  }
}

function EmailStep({
  account,
  error,
}: Readonly<{ account: Account; error: string | null }>) {
  const [email, setEmail] = useState('')

  return (
    <form
      className="flex flex-col gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault()
        account.request(email, 'code')
      }}
    >
      <p className="text-body text-muted">
        Un compte garde votre série et vos statistiques d’un appareil à l’autre,
        et ouvre l’archive complète. Votre progression du jour est reprise.
      </p>

      <label htmlFor="account-email" className="field-label">
        Adresse email
      </label>
      <input
        id="account-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value)
        }}
        className="field"
      />

      <button type="submit" disabled={account.busy} className="btn">
        {account.busy ? 'Envoi…' : 'Recevoir un code'}
      </button>

      {/* Second, et dit comme tel. Un bouton de même poids aurait envoyé la
          moitié des gens sur le chemin qui perd leur partie en cours. */}
      <button
        type="button"
        disabled={account.busy}
        onClick={() => {
          account.request(email, 'link')
        }}
        className="link text-body text-muted self-start p-1"
      >
        Ou recevoir un lien, si vous lisez vos mails sur cet appareil
      </button>

      <Problem message={error} />
    </form>
  )
}

function CodeStep({
  account,
  panel,
}: Readonly<{ account: Account; panel: Extract<AccountPanel, { step: 'code' }> }>) {
  const [code, setCode] = useState('')

  return (
    <form
      className="flex flex-col gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault()
        account.signIn(code)
      }}
    >
      <p className="text-body text-muted">
        {panel.sentLink
          ? `Un lien est parti vers ${panel.email}. Ouvrez-le puis confirmez sur la page qui s’affiche.`
          : `Un code à six chiffres est parti vers ${panel.email}. Saisissez-le ici, sans quitter cette page.`}
      </p>

      <label htmlFor="account-code" className="field-label">
        Code reçu
      </label>
      <SignInCodeField id="account-code" value={code} onChange={setCode} />

      <button type="submit" disabled={account.busy} className="btn">
        {account.busy ? 'Vérification…' : 'Se connecter'}
      </button>

      <button
        type="button"
        onClick={account.changeEmail}
        className="link text-body text-muted self-start p-1"
      >
        Changer d’adresse
      </button>

      <Problem message={panel.error} />
    </form>
  )
}

/**
 * Le compte de quelqu'un — et, pour une poignée de gens, la porte d'à côté.
 *
 * Le raccourci vers le back-office est **ici** et non dans la barre d'en-tête,
 * pour deux raisons qui vont dans le même sens. La barre tient trois boutons de
 * trente pixels dans une colonne de 430 : un quatrième qui n'apparaîtrait que
 * pour deux personnes serait cher payé pour tout le monde. Et surtout, c'est la
 * fenêtre qui répond déjà à « qui suis-je » — un rôle est une réponse à cette
 * question-là, pas un geste de jeu.
 *
 * Ce que ce lien n'est pas : une autorisation. `admin` vient du serveur, ne sert
 * qu'à décider d'un rendu, et chaque page du back-office rappelle
 * `requireAdmin()` de son côté. Quelqu'un qui se le fabriquerait dans son
 * navigateur gagnerait un bouton vers un formulaire de connexion.
 */
function SignedIn({
  account,
  email,
  admin,
}: Readonly<{ account: Account; email: string; admin: boolean }>) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <p className="text-body">
        Connecté en tant que <span className="font-semibold">{email}</span>.
      </p>

      {/* `prefetch={false}` : le back-office est un groupe de routes à part
          précisément pour que son bundle ne pèse jamais sur le jeu
          (`docs/stack-technique.md` §6), et un préchargement au survol le
          tirerait dans l'onglet où l'on joue avant même qu'on ait cliqué. */}
      {admin ? (
        <Link href="/admin" prefetch={false} className="btn text-center">
          Ouvrir le back-office
        </Link>
      ) : null}
      {/* Ce que la déconnexion ne fait pas mérite d'être écrit : elle ferme la
          session, pas la partie. Sans cette phrase, on n'ose pas cliquer. */}
      <p className="text-body text-muted">
        Vous déconnecter ferme la session sur cet appareil. Votre partie du jour
        reste telle quelle, et vos statistiques vous attendent à la prochaine
        connexion.
      </p>

      <button
        type="button"
        disabled={account.busy}
        onClick={account.signOut}
        className="btn-quiet self-start"
      >
        {account.busy ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </div>
  )
}

const Note = ({ children }: Readonly<{ children: string }>) => (
  <p className="text-body text-muted p-5">{children}</p>
)

const Problem = ({ message }: Readonly<{ message: string | null }>) =>
  message === null ? null : (
    <p role="alert" className="status-error">
      {message}
    </p>
  )
