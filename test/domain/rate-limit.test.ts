import { describe, expect, it } from 'vitest'

import { quotaLimiter } from '@/server/domain/rate-limit'

/**
 * La limite de fréquence de la demande d'un code ou d'un lien.
 *
 * Elle est ici, dans le seam pur, parce que tout ce qu'elle est est une
 * décision sur un compteur et une horloge — et parce que la seule façon
 * honnête de vérifier « la fenêtre repart après quinze minutes » est de
 * déplacer l'horloge à la main plutôt que d'attendre.
 *
 * Ce qu'elle protège tient en une phrase de `docs/stack-technique.md` §4bis :
 * sans la limite par adresse, on peut bombarder la boîte d'un tiers. Les deux
 * dimensions sont donc deux limiteurs, et c'est le service qui les consomme
 * tous les deux.
 */
describe('quotaLimiter', () => {
  const quota = { max: 3, windowMs: 60_000 }

  it('lets a key through up to its ceiling, then refuses it', () => {
    const limiter = quotaLimiter(quota)

    expect(limiter.take('a@example.test', 0)).toBe(true)
    expect(limiter.take('a@example.test', 1)).toBe(true)
    expect(limiter.take('a@example.test', 2)).toBe(true)
    expect(limiter.take('a@example.test', 3)).toBe(false)
  })

  it('counts each key on its own', () => {
    const limiter = quotaLimiter(quota)

    for (const at of [0, 1, 2]) expect(limiter.take('a@example.test', at)).toBe(true)

    // Une adresse épuisée n'épuise pas les autres : c'est toute la raison
    // d'être de la dimension « par adresse ».
    expect(limiter.take('a@example.test', 3)).toBe(false)
    expect(limiter.take('b@example.test', 3)).toBe(true)
  })

  it('starts a fresh window once the old one has run out', () => {
    const limiter = quotaLimiter(quota)

    for (const at of [0, 1, 2]) limiter.take('a@example.test', at)
    expect(limiter.take('a@example.test', 59_999)).toBe(false)

    expect(limiter.take('a@example.test', 60_000)).toBe(true)
  })

  it('does not let a refused attempt extend the window it was refused by', () => {
    // Sinon marteler la porte la garderait fermée indéfiniment : un joueur qui
    // recharge trois fois de trop attendrait la fenêtre de sa dernière
    // tentative, pas celle de sa première.
    const limiter = quotaLimiter(quota)

    for (const at of [0, 1, 2]) limiter.take('a@example.test', at)
    for (const at of [10_000, 20_000, 30_000]) limiter.take('a@example.test', at)

    expect(limiter.take('a@example.test', 60_000)).toBe(true)
  })

  it('forgets the keys whose window has passed, rather than growing for ever', () => {
    // Un compteur en mémoire dont rien ne sort est une fuite lente, et la clé
    // est ici une adresse arbitraire fournie par l'appelant.
    const limiter = quotaLimiter(quota)

    for (let index = 0; index < 500; index++) limiter.take(`visitor-${index}`, 0)
    expect(limiter.size()).toBe(500)

    limiter.take('quelqu-un-plus-tard', 60_000)

    expect(limiter.size()).toBe(1)
  })

  it('refuses everything when its ceiling is zero', () => {
    // Ce que vaut une limite mal configurée : fermée. Le sens inverse — un zéro
    // qui laisse tout passer — est la panne silencieuse du côté qui fait entrer.
    const limiter = quotaLimiter({ max: 0, windowMs: 60_000 })

    expect(limiter.take('a@example.test', 0)).toBe(false)
  })
})
