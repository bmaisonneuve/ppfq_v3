import { beforeEach, describe, expect, it } from 'vitest'

import { clubCrests, clubs, playerClubs } from '@/server/db/schema'
import {
  ClubMergeError,
  ClubNotFoundError,
  createClub,
  getClubDossier,
  mergeClubs,
  renameClub,
  searchClubs,
} from '@/server/services/club.service'
import { addPassage, getCurationDossier } from '@/server/services/curation.service'
import { setClubCrest } from '@/server/services/crest.service'

import { db, onlyRow } from '@test/setup/db'
import { CLUB_IDS, FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'

/**
 * The club seam: a club found, created, renamed and merged, called the way the
 * fiche calls it, against a real Postgres.
 *
 * A club is shared by every footballer who played there, which is what most of
 * these tests are actually about: a rename reaches every parcours at once, and
 * a merge must not lose a single passage on the way.
 */

const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999'

/** A one-pixel PNG. Small, real, and a raster type the service accepts. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('searchClubs', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('finds a club by a piece of its French name', async () => {
    expect((await searchClubs('borde')).map((c) => c.frName)).toEqual([
      'Girondins de Bordeaux',
    ])
  })

  it('finds a club by its English name, which is the admin fallback', async () => {
    expect((await searchClubs('Rennais')).map((c) => c.frName)).toEqual(['Stade rennais'])
  })

  it('ignores case', async () => {
    expect((await searchClubs('JUVENT')).map((c) => c.frName)).toEqual(['Juventus'])
  })

  it('answers nothing below two characters, like the typeahead', async () => {
    expect(await searchClubs('j')).toEqual([])
    expect(await searchClubs(' ')).toEqual([])
  })

  it('answers nothing when nothing matches', async () => {
    expect(await searchClubs('zzzz')).toEqual([])
  })

  it('orders by French name so the list does not move between two keystrokes', async () => {
    expect((await searchClubs('stade')).map((c) => c.frName)).toEqual([
      'Stade de Reims',
      'Stade rennais',
    ])
  })
})

describe('createClub', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('creates the club the source simply does not have, without a Wikidata id', async () => {
    const created = await createClub({ frName: 'Olympique de Marseille', enName: null })

    expect(created).toMatchObject({ frName: 'Olympique de Marseille' })
    expect((await searchClubs('marseille')).map((c) => c.id)).toEqual([created.id])
  })

  it('is immediately usable as the club of a passage', async () => {
    const created = await createClub({ frName: 'Olympique de Marseille', enName: null })

    await addPassage(FOOTBALLER_IDS.complete, {
      clubId: created.id,
      isLoan: false,
      startYear: 1986,
      endYear: 1988,
      matches: 60,
      goals: 10,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages[0]?.clubName).toBe('Olympique de Marseille')
  })

  it('does not collide with the Wikidata id of the clubs the import created', async () => {
    // `clubs.wikidata_qid` is unique, and null does not conflict with null in
    // Postgres — two hand-made clubs must both be insertable.
    const first = await createClub({ frName: 'Olympique de Marseille', enName: null })
    const second = await createClub({ frName: 'Racing Club de Lens', enName: 'RC Lens' })

    expect(first.id).not.toBe(second.id)
  })
})

describe('getClubDossier', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('reads a club, what it is called and how far it reaches', async () => {
    const club = await getClubDossier(CLUB_IDS.juventus)

    expect(club).toMatchObject({
      id: CLUB_IDS.juventus,
      frName: 'Juventus',
      enName: 'Juventus FC',
      wikidataQid: 'Q1422',
      crest: null,
    })
    // What a merge would move and a rename would touch: one passage, Zidane's.
    expect(club?.passageCount).toBe(1)
  })

  it('carries the crest and where it came from, so a wrong pick is visible', async () => {
    const key = await setClubCrest(CLUB_IDS.juventus, {
      bytes: PNG,
      contentType: 'image/png',
      sourceFile: 'Labeled_group_photo.png',
      sourceUrl: 'https://thumb.wikimedia.org/x.png',
      sourceWiki: 'en',
      license: 'Public domain',
    })

    expect((await getClubDossier(CLUB_IDS.juventus))?.crest).toEqual({
      key,
      byteSize: PNG.byteLength,
      sourceFile: 'Labeled_group_photo.png',
      sourceUrl: 'https://thumb.wikimedia.org/x.png',
      sourceWiki: 'en',
      license: 'Public domain',
    })
  })

  it('counts no passage for a club nobody played at', async () => {
    const created = await createClub({ frName: 'Olympique de Marseille', enName: null })

    expect((await getClubDossier(created.id))?.passageCount).toBe(0)
  })

  it('answers nothing for a club that does not exist', async () => {
    expect(await getClubDossier(UNKNOWN_ID)).toBeNull()
  })
})

describe('renameClub', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('renames a club the source names in no language', async () => {
    // The hole the code announced and could not fix: a club Wikidata has no
    // label for is inserted under its Q-id, and the parcours shows `Q123456`.
    const orphan = onlyRow(
      await db
        .insert(clubs)
        .values({ wikidataQid: 'Q900123', frName: 'Q900123', enName: null })
        .returning({ id: clubs.id }),
    )

    await renameClub(orphan.id, { frName: 'Sporting de Charleroi', enName: 'R. Charleroi SC' })

    expect(await getClubDossier(orphan.id)).toMatchObject({
      frName: 'Sporting de Charleroi',
      enName: 'R. Charleroi SC',
    })
  })

  it('changes the name in every parcours at once, because a club is shared', async () => {
    await renameClub(CLUB_IDS.juventus, { frName: 'Juventus de Turin', enName: 'Juventus FC' })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages.map((p) => p.clubName)).toContain('Juventus de Turin')
  })

  it('clears the English name, because not knowing it is a fact', async () => {
    await renameClub(CLUB_IDS.juventus, { frName: 'Juventus', enName: null })

    expect((await getClubDossier(CLUB_IDS.juventus))?.enName).toBeNull()
  })

  it('refuses a club that does not exist', async () => {
    await expect(
      renameClub(UNKNOWN_ID, { frName: 'Rien', enName: null }),
    ).rejects.toBeInstanceOf(ClubNotFoundError)
  })
})

describe('mergeClubs', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  /** The duplicate the catalogue creates on purpose: hand-made, no Q-id. */
  async function handMadeDuplicateOfJuventus(): Promise<string> {
    const duplicate = await createClub({ frName: 'Juve', enName: null })
    await addPassage(FOOTBALLER_IDS.loan, {
      clubId: duplicate.id,
      isLoan: false,
      startYear: 2019,
      endYear: 2021,
      matches: 40,
      goals: 3,
    })
    return duplicate.id
  }

  it('moves every passage onto the club that survives, and loses none', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()
    const before = (await db.select().from(playerClubs)).length

    const report = await mergeClubs({ keepId: CLUB_IDS.juventus, mergedId })

    expect(report.passagesMoved).toBe(1)
    expect(await db.select().from(playerClubs)).toHaveLength(before)
    expect((await getClubDossier(CLUB_IDS.juventus))?.passageCount).toBe(2)
  })

  it('keeps the passage on the footballer who had it', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()

    await mergeClubs({ keepId: CLUB_IDS.juventus, mergedId })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.loan)
    expect(dossier?.passages.map((p) => p.clubName)).toContain('Juventus')
  })

  it('deletes the duplicate', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()

    await mergeClubs({ keepId: CLUB_IDS.juventus, mergedId })

    expect(await getClubDossier(mergedId)).toBeNull()
  })

  it('lets the survivor adopt the Wikidata id it did not have', async () => {
    // The real shape of the duplicate: the admin typed the club in, the import
    // later met it. Without adopting the id, the next import makes a third row.
    const keep = await createClub({ frName: 'Juve', enName: null })

    const report = await mergeClubs({ keepId: keep.id, mergedId: CLUB_IDS.juventus })

    expect(report.adopted).toEqual({ wikidataQid: true, enName: true, crestKey: false })
    expect(await getClubDossier(keep.id)).toMatchObject({
      frName: 'Juve',
      enName: 'Juventus FC',
      wikidataQid: 'Q1422',
    })
  })

  it('never overwrites what the survivor already has', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()
    await renameClub(mergedId, { frName: 'Juve', enName: 'Juve FC' })

    const report = await mergeClubs({ keepId: CLUB_IDS.juventus, mergedId })

    expect(report.adopted.enName).toBe(false)
    expect((await getClubDossier(CLUB_IDS.juventus))?.enName).toBe('Juventus FC')
  })

  it('adopts the crest of the duplicate when the survivor has none', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()
    const key = await setClubCrest(mergedId, {
      bytes: PNG,
      contentType: 'image/png',
      sourceFile: 'crest.png',
      sourceUrl: null,
      sourceWiki: null,
      license: null,
    })

    await mergeClubs({ keepId: CLUB_IDS.juventus, mergedId })

    expect((await getClubDossier(CLUB_IDS.juventus))?.crest?.key).toBe(key)
    // The bytes survive the club that pointed at them: they are shared, and
    // deleting one is the takedown procedure, not a side effect of a merge.
    expect(await db.select().from(clubCrests)).toHaveLength(1)
  })

  it('refuses a club merged into itself', async () => {
    await expect(
      mergeClubs({ keepId: CLUB_IDS.juventus, mergedId: CLUB_IDS.juventus }),
    ).rejects.toBeInstanceOf(ClubMergeError)
  })

  it('refuses a survivor that does not exist, and changes nothing', async () => {
    const mergedId = await handMadeDuplicateOfJuventus()

    await expect(
      mergeClubs({ keepId: UNKNOWN_ID, mergedId }),
    ).rejects.toBeInstanceOf(ClubNotFoundError)
    expect(await getClubDossier(mergedId)).not.toBeNull()
  })

  it('refuses a duplicate that does not exist', async () => {
    await expect(
      mergeClubs({ keepId: CLUB_IDS.juventus, mergedId: UNKNOWN_ID }),
    ).rejects.toBeInstanceOf(ClubNotFoundError)
  })
})
