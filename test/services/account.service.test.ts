import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { players, users } from '@/server/db/schema'
import { sendSignIn, signInByCode, signInByLink } from '@/server/services/account.service'
import type { RequestContext } from '@/server/services/account.service'
import { ACCOUNT_LINK_PATH, ACCOUNT_LINK_TOKEN } from '@/shared/account'

import { db } from '@test/setup/db'
import { clearMailbox, codeIn, linkIn, mailCountTo, mailTo } from '@test/setup/mailbox'
import { PLAYER_COOKIE_IDS, PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * Le compte, du bout en bout : la demande part, l'email arrive, le code ouvre
 * une session, et la progression suit.
 *
 * Ce fichier lit **une vraie boîte mail** (Mailpit, `test/setup/mailbox.ts`) et
 * ce n'est pas du décor. Sans mot de passe, l'email est le chemin de connexion
 * (`docs/stack-technique.md` §4bis) : un test qui s'arrêterait à « la fonction
 * d'envoi a été appelée » vérifierait la moitié la moins risquée. Et le code
 * est haché en base exprès, donc l'ouvrir est le seul moyen de le connaître —
 * exactement comme pour un joueur.
 *
 * Ce qui n'est pas ici : les portes elles-mêmes. `requestSignIn` et
 * `signInWithCode` lisent `next/headers` et reposent un cookie, ce qui demande
 * une requête Next à fabriquer ; elles n'ajoutent rien d'autre, et le service
 * est coupé en deux précisément pour que tout ce qui décide soit ici.
 */
/**
 * Chaque test part d'une adresse et d'une IP à lui.
 *
 * La limite de fréquence est **en mémoire** (`docs/stack-technique.md` §4bis),
 * donc elle survit à la remise à zéro de la base entre deux tests : deux tests
 * qui partageraient une adresse se limiteraient l'un l'autre, et le second
 * échouerait pour une raison qui n'est pas la sienne. C'est une propriété du
 * dispositif et non une gêne du harnais — la fenêtre est de quinze minutes
 * précisément pour qu'on ne puisse pas la contourner en attendant.
 */
let sequence = 0
function nextAddress(): string {
  sequence += 1
  return `joueuse-${sequence}@example.test`
}

/** Le navigateur où l'on jouait : il porte le cookie du joueur. */
const inTheGameTab = (): RequestContext => ({
  request: new Headers({ 'x-forwarded-for': nextIp() }),
  presented: PLAYER_COOKIE_IDS.mine,
})

/** Le navigateur du client mail : une autre machine, et aucun cookie de jeu. */
const inTheMailBrowser = (): RequestContext => ({
  request: new Headers({ 'x-forwarded-for': nextIp() }),
  presented: null,
})

/** Un appelant à l'adresse qu'on lui donne, pour les tests qui la choisissent. */
const fromMachine = (ip: string, presented: string | null = null): RequestContext => ({
  request: new Headers({ 'x-forwarded-for': ip }),
  presented,
})

/** Une IP de documentation par appel (RFC 5737), donc jamais deux fois la même. */
let ipSequence = 0
function nextIp(): string {
  ipSequence += 1
  return `198.18.${Math.floor(ipSequence / 250)}.${ipSequence % 250}`
}

const accountOf = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0]

const playerOf = async (playerId: string) =>
  (await db.select().from(players).where(eq(players.id, playerId)))[0]

/** L'adresse du test en cours, et celle de quelqu'un d'autre. */
let EMAIL = ''
let OTHER_EMAIL = ''

beforeEach(async () => {
  EMAIL = nextAddress()
  OTHER_EMAIL = nextAddress()
  await seedPlayers(db)
  await clearMailbox()
})

describe('demander un code', () => {
  it('sends one, and it is readable without clicking anything', async () => {
    const outcome = await sendSignIn(EMAIL, 'code', inTheGameTab())
    expect(outcome).toEqual({ ok: true, account: null })

    const mail = await mailTo(EMAIL)

    expect(codeIn(mail)).toMatch(/^\d{6}$/u)
    // Il est dans l'objet aussi : un code lu dans la liste des messages est un
    // aller-retour de moins avec l'onglet où l'on joue.
    expect(mail.subject).toContain(codeIn(mail))
    // Et rien n'y est cliquable : c'est ce qui le rend insensible aux scanners
    // de liens, qui brûleraient un jeton à usage unique avant le clic.
    expect(mail.text).not.toMatch(/https?:\/\//u)
  })

  it('says nothing about whether the address already had an account', async () => {
    // S'inscrire et se connecter sont une seule action (specs §6) : il n'y a
    // rien à distinguer, donc rien à révéler.
    const first = await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.10'))
    const code = codeIn(await mailTo(EMAIL))
    await signInByCode(EMAIL, code, fromMachine('198.51.100.10'))
    await clearMailbox()

    const second = await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.11'))

    expect(second).toEqual(first)
  })

  it('records the joueur the tab was playing as, before the mail even goes', async () => {
    await sendSignIn(EMAIL, 'code', inTheGameTab())

    const code = codeIn(await mailTo(EMAIL))
    // La connexion se fait ailleurs, sans le cookie : seule l'association peut
    // encore dire quelle progression reprendre.
    await signInByCode(EMAIL, code, inTheMailBrowser())

    const account = await accountOf(EMAIL)
    expect((await playerOf(PLAYER_IDS.mine))?.authUserId).toBe(account?.id)
  })

  it('creates no joueur for somebody who has never played', async () => {
    const before = (await db.select().from(players)).length

    await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.20'))

    expect(await db.select().from(players)).toHaveLength(before)
  })
})

describe('quand l’email ne part pas', () => {
  /**
   * Le pire échec possible d'une porte sans mot de passe : dire « c'est parti »
   * alors que rien n'est parti. Le joueur attend alors un code qui n'existe
   * pas, et il n'a aucun autre moyen d'entrer.
   *
   * C'est exactement ce que faisait le chemin du code avant ce test :
   * `sendVerificationOTP` de Better Auth passe le rappel d'envoi par
   * `runInBackgroundOrAwait`, qui attrape l'exception et répond quand même
   * `{ success: true }`. La demande fabrique donc le code par
   * `createVerificationOTP` et l'envoie elle-même.
   */
  const withDeadRelay = async (run: () => Promise<unknown>): Promise<unknown> => {
    const configured = process.env.MAIL_SMTP_URL
    // Le port 1 : réservé, et personne n'écoute — un refus de connexion
    // immédiat plutôt qu'une attente.
    process.env.MAIL_SMTP_URL = 'smtp://127.0.0.1:1'
    try {
      return await run()
    } finally {
      process.env.MAIL_SMTP_URL = configured
    }
  }

  it('refuses the request rather than claiming a code is on its way', async () => {
    const outcome = await withDeadRelay(
      async () => await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.60')),
    )

    expect(outcome).toEqual({ ok: false, refusal: 'mail-unavailable' })
    expect(await mailCountTo(EMAIL)).toBe(0)
  })

  it('says the same thing about a link that could not be sent', async () => {
    const outcome = await withDeadRelay(
      async () => await sendSignIn(EMAIL, 'link', fromMachine('198.51.100.61')),
    )

    expect(outcome).toEqual({ ok: false, refusal: 'mail-unavailable' })
    expect(await mailCountTo(EMAIL)).toBe(0)
  })

  it('leaves the relay working for everybody else afterwards', async () => {
    // Le transport est mémorisé par URL : une panne ne doit pas figer un
    // transport mort pour le reste du processus.
    await withDeadRelay(async () => await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.62')))

    expect(await sendSignIn(OTHER_EMAIL, 'code', fromMachine('198.51.100.63'))).toEqual({
      ok: true,
      account: null,
    })
    expect(codeIn(await mailTo(OTHER_EMAIL))).toMatch(/^\d{6}$/u)
  })
})

describe('la limite de fréquence', () => {
  it('stops one address being bombarded, whatever the caller', async () => {
    // La dimension qui protège quelqu'un dont l'adresse est tapée par un autre.
    // Chaque appel vient d'une IP différente : c'est l'adresse qui arrête.
    const address = 'cible@example.test'
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await sendSignIn(address, 'code', fromMachine(`198.51.100.${100 + attempt}`))).toEqual({
        ok: true,
        account: null,
      })
    }

    expect(await sendSignIn(address, 'code', fromMachine('198.51.100.199'))).toEqual({
      ok: false,
      refusal: 'too-many-requests',
    })
    expect(await mailCountTo(address)).toBe(5)
  })

  it('stops one caller enumerating addresses', async () => {
    const machine = fromMachine('192.0.2.44')
    for (let attempt = 0; attempt < 20; attempt++) {
      await sendSignIn(`cible-${attempt}@example.test`, 'code', machine)
    }

    expect(await sendSignIn('cible-21@example.test', 'code', machine)).toEqual({
      ok: false,
      refusal: 'too-many-requests',
    })
  })
})

describe('se connecter avec le code', () => {
  it('opens a session and carries the anonymous progression over', async () => {
    await sendSignIn(EMAIL, 'code', inTheGameTab())
    const code = codeIn(await mailTo(EMAIL))

    const result = await signInByCode(EMAIL, code, inTheGameTab())

    expect(result).toEqual({
      ok: true,
      account: { email: EMAIL },
      // Le navigateur repart avec le cookie du joueur qu'il avait déjà : la
      // reprise est un `UPDATE` d'une colonne, pas un déménagement (ADR-0003).
      cookieId: PLAYER_COOKIE_IDS.mine,
    })
    const account = await accountOf(EMAIL)
    expect((await playerOf(PLAYER_IDS.mine))?.authUserId).toBe(account?.id)
  })

  it('refuses a code that was never sent', async () => {
    expect(await signInByCode(EMAIL, '000000', inTheGameTab())).toEqual({
      ok: false,
      refusal: 'bad-code',
    })
  })

  it('refuses a code that has already been used: once, and once only', async () => {
    await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.30'))
    const code = codeIn(await mailTo(EMAIL))

    expect((await signInByCode(EMAIL, code, fromMachine('198.51.100.30'))).ok).toBe(true)

    expect(await signInByCode(EMAIL, code, fromMachine('198.51.100.30'))).toEqual({
      ok: false,
      refusal: 'bad-code',
    })
  })

  it('refuses somebody else’s code', async () => {
    await sendSignIn(EMAIL, 'code', fromMachine('198.51.100.31'))
    const code = codeIn(await mailTo(EMAIL))

    expect(await signInByCode(OTHER_EMAIL, code, fromMachine('198.51.100.32'))).toEqual({
      ok: false,
      refusal: 'bad-code',
    })
  })
})

describe('le lien magique', () => {
  it('points at a page of ours, not at a callback that consumes', async () => {
    await sendSignIn(EMAIL, 'link', inTheGameTab())

    const url = new URL(linkIn(await mailTo(EMAIL)))

    expect(url.pathname).toBe(ACCOUNT_LINK_PATH)
    expect(url.searchParams.get(ACCOUNT_LINK_TOKEN)).not.toBeNull()
  })

  it('is not consumed by anything that merely fetches it', async () => {
    // Un scanner de liens — SafeLinks, un antivirus mail — précharge l'URL.
    // Elle ne mène à aucun endpoint : c'est la confirmation qui consomme, et
    // c'est pour ça que le jeton est encore bon ici.
    await sendSignIn(EMAIL, 'link', inTheGameTab())
    const token = tokenOf(linkIn(await mailTo(EMAIL)))

    await fetch(linkIn(await mailTo(EMAIL))).catch(() => undefined)

    expect((await signInByLink(token, inTheGameTab())).ok).toBe(true)
  })

  it('carries the progression over even when it opens in another browser', async () => {
    // Le cas qui fait exister `pending_claims`, et celui que le code évite.
    await sendSignIn(EMAIL, 'link', inTheGameTab())
    const token = tokenOf(linkIn(await mailTo(EMAIL)))

    const result = await signInByLink(token, inTheMailBrowser())

    expect(result).toEqual({
      ok: true,
      account: { email: EMAIL },
      cookieId: PLAYER_COOKIE_IDS.mine,
    })
    const account = await accountOf(EMAIL)
    expect((await playerOf(PLAYER_IDS.mine))?.authUserId).toBe(account?.id)
  })

  it('serves once, and once only', async () => {
    await sendSignIn(EMAIL, 'link', fromMachine('198.51.100.40'))
    const token = tokenOf(linkIn(await mailTo(EMAIL)))

    expect((await signInByLink(token, inTheMailBrowser())).ok).toBe(true)

    expect(await signInByLink(token, inTheMailBrowser())).toEqual({
      ok: false,
      refusal: 'bad-code',
    })
  })

  it('refuses a token nobody minted', async () => {
    expect(await signInByLink('jeton-invente', inTheMailBrowser())).toEqual({
      ok: false,
      refusal: 'bad-code',
    })
  })
})

const tokenOf = (url: string): string => {
  const token = new URL(url).searchParams.get(ACCOUNT_LINK_TOKEN)
  if (token === null) throw new Error(`Pas de jeton dans ${url}`)
  return token
}
