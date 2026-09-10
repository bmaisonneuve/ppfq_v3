import { describe, expect, it } from 'vitest'

import { MAX_TRIES, describePlay } from '@/shared/play'
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
