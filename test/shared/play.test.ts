import { describe, expect, it } from 'vitest'

import { HINT_LABELS, HINT_TIERS, MAX_TRIES, describePlay } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'

/**
 * The words a joueur reads about his own partie.
 *
 * Isomorphic and pure: the personal state arrives over a request of its own
 * after hydration, so this runs on the client — and it is the only place the
 * six essais of the specs are spelled out for the eye. The *rule* of six is the
 * service's (#9); what is here is the denominator, and a partie that shows
 * "3 essais sur 5" would be a bug nobody could see in a screenshot.
 */
const play = (over: Partial<EnigmaPlay> = {}): EnigmaPlay => ({
  position: 1,
  triesUsed: 0,
  status: 'in_progress',
  hints: [],
  answer: null,
  ...over,
})

describe('describePlay', () => {
  it('counts an untouched partie as no essai at all', () => {
    // A partie is born when the enigma is opened, so this is what the vast
    // majority of parties say: opened, nothing spent.
    expect(describePlay(play())).toBe('0 essai sur 6')
  })

  it('keeps the singular for one essai', () => {
    expect(describePlay(play({ triesUsed: 1 }))).toBe('1 essai sur 6')
  })

  it('counts what is spent against what there is', () => {
    expect(describePlay(play({ triesUsed: 3 }))).toBe('3 essais sur 6')
    expect(describePlay(play({ triesUsed: MAX_TRIES }))).toBe('6 essais sur 6')
  })

  it('says how many essais a footballer found cost', () => {
    expect(describePlay(play({ triesUsed: 1, status: 'solved' }))).toBe('Trouvé en 1 essai')
    expect(describePlay(play({ triesUsed: 4, status: 'solved' }))).toBe('Trouvé en 4 essais')
  })

  it('says a partie was lost without saying how', () => {
    // Six errors and a grid that turned are the same outcome for the joueur,
    // and the second one is not his fault in a way worth spelling out: the
    // number of essais spent on a partie the day took away says nothing.
    expect(describePlay(play({ triesUsed: 6, status: 'failed' }))).toBe('Échoué')
    expect(describePlay(play({ triesUsed: 2, status: 'failed' }))).toBe('Échoué')
  })
})

/**
 * The words the ladder is announced in, and one of them is a game rule.
 *
 * « En championnat » on tiers 4 and 5 is not a caption (specs §3): the source
 * counts neither the domestic cups nor the European competitions, so Messi at
 * Barcelona is 520 matchs and 474 buts, which is the Liga alone. Without the
 * words, a joueur who knows his figures reads the hint as a mistake — and on a
 * hint, confidence is worth more than precision. It is asserted rather than
 * remembered because it is two words that any tidying would drop.
 */
describe('HINT_LABELS', () => {
  it('says « en championnat » on the two tiers that count matches and goals', () => {
    expect(HINT_LABELS[4]).toContain('en championnat')
    expect(HINT_LABELS[5]).toContain('en championnat')
  })

  it('names the five tiers in the order the specs fix', () => {
    expect(HINT_TIERS.map((tier) => HINT_LABELS[tier])).toEqual([
      'Décennie de début',
      'Durée par club',
      'Nationalité',
      'Matchs en championnat',
      'Buts en championnat',
    ])
  })

  it('has one label per tier and one tier per essai but the last', () => {
    // Five tiers for six essais: the sixth erreur reveals the answer instead.
    expect(HINT_TIERS).toHaveLength(MAX_TRIES - 1)
  })
})
