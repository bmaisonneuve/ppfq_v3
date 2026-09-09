import { describe, expect, it } from 'vitest'

import { normalizeSearchTerm } from '@/shared/search'

/**
 * Normalisation is the contract between the import and the query: a term is
 * stored normalised and a query is normalised the same way, so anything the two
 * sides disagree about is a footballer nobody can find. That makes this a wide
 * case matrix on a pure function — the pure seam's reason to exist.
 */
describe('normalizeSearchTerm', () => {
  it('lowercases', () => {
    expect(normalizeSearchTerm('ZIDANE')).toBe('zidane')
  })

  it('strips the accents a player will not type', () => {
    expect(normalizeSearchTerm('Zinédine Zidane')).toBe('zinedine zidane')
    expect(normalizeSearchTerm('Javier Hernández')).toBe('javier hernandez')
    expect(normalizeSearchTerm('Zlatan Ibrahimović')).toBe('zlatan ibrahimovic')
  })

  it('gives the two spellings of one name the same term', () => {
    // Wikidata ships both, and they must collapse onto a single row.
    expect(normalizeSearchTerm('Zinédine Zidane')).toBe(normalizeSearchTerm('Zinedine Zidane'))
  })

  it('folds the Latin letters that no amount of NFD decomposes', () => {
    expect(normalizeSearchTerm('Peter Bøgelund')).toBe('peter bogelund')
    expect(normalizeSearchTerm('Robert Lewandowski')).toBe('robert lewandowski')
    expect(normalizeSearchTerm('Łukasz Fabiański')).toBe('lukasz fabianski')
    expect(normalizeSearchTerm('Đorđe Ivanović')).toBe('dorde ivanovic')
    expect(normalizeSearchTerm('Æ Œ ß')).toBe('ae oe ss')
  })

  it('closes up an apostrophe, because that is how the name is typed', () => {
    // "ngolo" is what a player types for N'Golo Kanté.
    expect(normalizeSearchTerm("N'Golo Kanté")).toBe('ngolo kante')
    expect(normalizeSearchTerm('N’Golo Kanté')).toBe('ngolo kante')
    expect(normalizeSearchTerm("A'ala Hubail")).toBe('aala hubail')
  })

  it('turns a hyphen into a word break', () => {
    expect(normalizeSearchTerm('Jean-Pierre Papin')).toBe('jean pierre papin')
  })

  it('drops an initial dot', () => {
    expect(normalizeSearchTerm('J. Hernández')).toBe('j hernandez')
  })

  it('collapses and trims whitespace', () => {
    expect(normalizeSearchTerm('  Zinedine   Zidane \n')).toBe('zinedine zidane')
  })

  it('keeps letters it does not know how to fold rather than losing the name', () => {
    // The extract is Latin-script, but a term that normalised to nothing would
    // be a footballer no query could ever reach.
    expect(normalizeSearchTerm('Лев Яшин')).toBe('лев яшин')
  })

  it('leaves digits alone', () => {
    expect(normalizeSearchTerm('Chicharito 2')).toBe('chicharito 2')
  })

  it('renders LIKE wildcards inert', () => {
    // The prefix query interpolates the term into a LIKE pattern. Normalisation
    // keeps only letters and digits, so there is no wildcard left to escape —
    // and this test is what makes that a guarantee rather than a coincidence.
    expect(normalizeSearchTerm('%')).toBe('')
    expect(normalizeSearchTerm('zid%ane')).toBe('zid ane')
    expect(normalizeSearchTerm('zid_ane')).toBe('zid ane')
    expect(normalizeSearchTerm('zid\\ane')).toBe('zid ane')
  })

  it('returns an empty term for input with nothing to search on', () => {
    expect(normalizeSearchTerm('')).toBe('')
    expect(normalizeSearchTerm('   ')).toBe('')
    expect(normalizeSearchTerm('!!!')).toBe('')
  })

  it('is idempotent', () => {
    const once = normalizeSearchTerm("Zinédine Yazid Zidane-N'Golo")
    expect(normalizeSearchTerm(once)).toBe(once)
  })
})
