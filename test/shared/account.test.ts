import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_SESSION_SECONDS,
  EmailInput,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_TTL_SECONDS,
  SignInCodeInput,
} from '@/shared/account'

/**
 * La politique du compte, affirmée sur ses valeurs.
 *
 * Même raison que `test/domain/player-cookie.test.ts` un cran plus loin : ces
 * durées-là sont des **promesses** — dix minutes et usage unique, 180 jours
 * glissants (`docs/stack-technique.md` §4bis) — et une promesse laissée en
 * littéral dans un objet d'options est une promesse que personne ne relit.
 * `account-auth.ts` passe ces constantes à Better Auth et n'écrit aucun nombre
 * lui-même, donc ce qui est vérifié ici est ce qui est configuré là-bas.
 *
 * La normalisation de l'adresse est ici pour une raison moins évidente et plus
 * sérieuse : c'est elle qui fait la **clé de la limite de fréquence**. Une
 * adresse qui échapperait à la normalisation ferait repartir le compteur qui
 * protège la boîte de son propriétaire, et il suffirait d'une majuscule.
 */
describe('la politique du compte', () => {
  it('donne dix minutes au code comme au jeton', () => {
    expect(SIGN_IN_TTL_SECONDS).toBe(10 * 60)
  })

  it('tient une session 180 jours', () => {
    expect(ACCOUNT_SESSION_SECONDS).toBe(180 * 24 * 60 * 60)
  })

  it('demande six chiffres, et pas cinq ni sept', () => {
    expect(SIGN_IN_CODE_LENGTH).toBe(6)
  })
})

describe('EmailInput', () => {
  it('range une adresse en minuscules et sans espaces autour', () => {
    // Deux saisies mobiles de la même adresse doivent être la même clé, sans
    // quoi la limite par adresse se contourne avec la touche majuscule.
    expect(EmailInput.parse('  Joueuse@Example.TEST ')).toBe('joueuse@example.test')
  })

  it('refuse ce qui n’est pas une adresse', () => {
    expect(EmailInput.safeParse('pas-une-adresse').success).toBe(false)
    expect(EmailInput.safeParse('').success).toBe(false)
  })

  it('refuse une adresse plus longue que ce qu’une adresse peut être', () => {
    expect(EmailInput.safeParse(`${'a'.repeat(250)}@example.test`).success).toBe(false)
  })
})

describe('SignInCodeInput', () => {
  it('accepte un code collé avec ses espaces', () => {
    // « 123 456 » est ce que rend la moitié des collages depuis un client mail.
    // Le refuser serait refuser la moitié des collages pour une raison que
    // personne ne voit à l'écran.
    expect(SignInCodeInput.parse('123 456')).toBe('123456')
    expect(SignInCodeInput.parse(' 123456 ')).toBe('123456')
  })

  it('refuse tout ce qui n’est pas six chiffres', () => {
    for (const typed of ['12345', '1234567', 'abcdef', '12a456', '']) {
      expect(SignInCodeInput.safeParse(typed).success).toBe(false)
    }
  })
})
