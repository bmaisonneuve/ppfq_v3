/**
 * Le catalogue — la moitié du schéma que le jeu **lit** et n'écrit jamais en
 * jouant : les footballeurs, leurs noms, leurs parcours, les clubs, les
 * nationalités, et les octets des blasons et des drapeaux.
 *
 * Séparée de `schema.ts` par la taille, et la coupure tombe juste parce que la
 * dépendance ne va que dans un sens : une énigme désigne un footballeur, et
 * rien dans le catalogue ne sait qu'il existe des grilles ou des joueurs. Ce
 * fichier ne connaît donc que lui-même, et `schema.ts` le réexporte.
 *
 * Source of truth for the model: `docs/modele-donnees.md`. When this file and
 * that document disagree, the document wins and this file is the bug.
 *
 * Comme `schema.ts`, et pour la même raison, il ne porte pas `server-only` :
 * drizzle-kit le lit depuis Node pour générer les migrations. La barrière est
 * ailleurs — la règle ESLint interdit `app/** -> server/db/**`.
 */
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  timestamp,
} from 'drizzle-orm/pg-core'


/**
 * `bytea`, which drizzle-kit has no builder for.
 *
 * `pg` hands a `bytea` back as a `Buffer` and takes one on the way in, so the
 * mapping is the identity and the only thing this declares is the SQL type the
 * migration has to write.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

/**
 * A flag, the bytes themselves, addressed by their content.
 *
 * **The key is the SHA-256 of `bytes`**, which is what lets the read path
 * promise `immutable` and mean it: replacing a flag writes different bytes,
 * therefore a different key, therefore a different URL, and there is nothing to
 * invalidate. Two nationalities that end up with byte-identical flags share the
 * row, which is a consequence and not a goal.
 *
 * ## Why a table and not a column on `nationalities`
 *
 * `catalogue.service.ts` reads a nationality as `select({ nationality:
 * nationalities })` — every column. A `bytea` sitting there would travel with
 * every career read, for the benefit of the one screen that shows an image. A
 * 64-character key does not, and the bytes are fetched only by the route that
 * serves them.
 *
 * ## Why the bytes are in Postgres and not in a bucket
 *
 * Measured by seeding the whole source: 274 nationalities dressed, **260 rows**
 * — fourteen flags turn out to be byte-identical to another and share one —
 * 1,3 kB the median, 12 kB the worst, **491 kB the lot**. Against the 15-20 GB
 * a year `player_progress` is sized for (`docs/modele-donnees.md` §9) that is
 * nothing. Postgres moves a `bytea` over 2 kB out of the table into TOAST on
 * its own, and the read path is cached indefinitely. An object store would
 * bring an account, keys, a development service and a **second backup story**,
 * where the procedure has to stay "restore Postgres". Same decision, same
 * reasons and same shape as `club_crests`: see ADR-0010.
 *
 * The indirection the model wanted is kept: a **key**, never a URL. The day the
 * volume justifies a bucket, the same hash is the object name.
 */
export const nationalityFlags = pgTable('nationality_flags', {
  /** SHA-256 of `bytes`, lower-case hex. The content address, and the row key. */
  key: text('key').primaryKey(),
  bytes: bytea('bytes').notNull(),
  /** What the read path serves. `image/webp` for everything the seed renders. */
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  /** `fr.svg`, `gb-eng.svg` — the source file the bytes were rendered from. */
  sourceFile: text('source_file'),
  /** `flag-icons 7.5.0 (MIT)`, or what an admin states for one he uploaded. */
  license: text('license'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Sporting nationality. One per footballer, even for a dual national. */
export const nationalities = pgTable(
  'nationalities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** ISO 3166-1 alpha-2, the natural key. */
    code: text('code').notNull(),
    frName: text('fr_name').notNull(),
    enName: text('en_name'),
    /**
     * The flag, by content address — **not** an S3 key, which is what the
     * column used to be called and never was. Still a key and never a URL:
     * where the bytes are served from must be free to move.
     *
     * `set null` on delete, so removing a flag is one row to delete and is not
     * blocked by the nationalities pointing at it. A nationality with no flag
     * is a missing image, not a broken row — and, once hint 3 exists, a
     * footballer who is simply not schedulable.
     *
     * No index on it, unlike `clubs.crest_key`: there are ~200 nationalities,
     * and a sequential scan over 200 rows is faster than the index would be.
     */
    flagKey: text('flag_key').references(() => nationalityFlags.key, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('nationalities_code_key').on(t.code)],
)

/**
 * A club crest, the bytes themselves, addressed by their content.
 *
 * **The key is the SHA-256 of `bytes`**, and that one fact carries the whole
 * design. Two clubs sharing a crest share a row. Replacing a crest writes a
 * *different* key, so the URL that serves it changes and the old one may be
 * cached for ever — which is exactly what `Cache-Control: immutable` on the
 * read path claims, and what makes the claim true rather than hopeful.
 *
 * ## Why the bytes are in Postgres and not in a bucket
 *
 * Measured: the ticket counts ~15-20 kB a crest, and this implementation ~35 kB
 * on average at the width it asks for. A few thousand clubs at the very most —
 * under ~200 MB either way, against the 15-20 GB a year `player_progress` is
 * sized for (`docs/modele-donnees.md` §9). Postgres moves a `bytea` over 2 kB out of the
 * table into TOAST on its own, and the read path is cached indefinitely behind
 * Cloudflare, so this is not a hot path. An object store would bring an
 * account, keys, a development service and — the reason that actually decides
 * it — a **second backup story**, while #17 asks for one verified full restore.
 * The procedure has to stay "restore Postgres". See ADR-0010.
 *
 * The indirection the model wanted is kept: a **key**, never a URL. The day the
 * volume justifies a bucket, the same hash is the object name.
 *
 * ## What sits next to the bytes, and why
 *
 * `source_file` is the Wikipedia file the image came from, and it is not
 * decoration: the main image of an article is **not always the crest** — the
 * English article of London Caledonians FC answers with a team photograph from
 * 1894 — so the name is what makes a wrong pick visible on the club's fiche.
 * `license` and `source_url` are the takedown story: the legal risk is the one
 * already assessed and accepted (`docs/stack-technique.md` §11), and a removal
 * has to be one row to delete.
 */
export const clubCrests = pgTable('club_crests', {
  /** SHA-256 of `bytes`, lower-case hex. The content address, and the row key. */
  key: text('key').primaryKey(),
  bytes: bytea('bytes').notNull(),
  /** What the read path serves. `image/png` for everything the thumbnailer renders. */
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  /** `Logo_Manchester_United_FC.svg`, or the name of the file an admin uploaded. */
  sourceFile: text('source_file'),
  /** The thumbnail actually fetched. Null for a hand upload. */
  sourceUrl: text('source_url'),
  /** `fr`, `en`, or null when an admin uploaded it himself. */
  sourceWiki: text('source_wiki'),
  /** As the source states it — « marque déposée », for most of them. */
  license: text('license'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikidataQid: text('wikidata_qid'),
    /** Current French name — the one the game displays. */
    frName: text('fr_name').notNull(),
    enName: text('en_name'),
    /**
     * The crest, by content address — **not** an S3 key, which is what the
     * column used to be called and never was (ADR-0010). Still a key and never
     * a URL: where the bytes are served from must be free to move.
     *
     * `set null` on delete, because deleting a crest row is the takedown
     * procedure: it must not be blocked by the clubs that point at it, and a
     * club with no crest is a club with a missing image, not a broken row.
     */
    crestKey: text('crest_key').references(() => clubCrests.key, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('clubs_wikidata_qid_key').on(t.wikidataQid),
    // What the backfill walks: the clubs that have no crest yet. Also the
    // index that makes "which clubs point at this crest" cheap on a takedown.
    index('clubs_crest_key_idx').on(t.crestKey),
  ],
)

/**
 * Search referential *and* curated catalogue in one table. "Curated" is not a
 * status: it is the fact of having `player_clubs`, so every curation column is
 * nullable.
 */
export const footballers = pgTable(
  'footballers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null when the row was entered by hand rather than imported. */
    wikidataQid: text('wikidata_qid'),
    name: text('name').notNull(),
    /** Opened by the admin on every curation — the only guard against a silent hole. */
    wikiFrUrl: text('wiki_fr_url'),
    wikiEnUrl: text('wiki_en_url'),
    /** Wikipedia edition count. Search ranking only: never displayed, never difficulty. */
    sitelinks: integer('sitelinks').notNull().default(0),
    /** Nullable, but required to schedule: hint 3 would otherwise be empty. */
    nationalityId: uuid('nationality_id').references(() => nationalities.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('footballers_wikidata_qid_key').on(t.wikidataQid),
    // The suggestion ranking, in the exact order the typeahead asks for it:
    // notoriety, then name, then id — the last two only to make a tie
    // repeatable. Carrying all three columns is what lets Postgres walk the
    // referential in ranked order and stop at the tenth match, instead of
    // aggregating the 28 000 names that start with "ma" and sorting them.
    // Measured on the real extract: 117 ms before, 0.8 ms after.
    // `nullsFirst` is not decoration: `ORDER BY sitelinks DESC` means DESC
    // NULLS FIRST, and an index declared NULLS LAST cannot supply that order,
    // so Postgres falls back to sorting the whole match set. The column is NOT
    // NULL, which is exactly why the difference is invisible in the results and
    // shows up only in the plan.
    index('footballers_ranking_idx').on(
      t.sitelinks.desc().nullsFirst(),
      t.name.asc(),
      t.id.asc(),
    ),
    index('footballers_nationality_id_idx').on(t.nationalityId),
  ],
)

/**
 * Canonical names *and* aliases in one table, so the typeahead is one query and
 * not a union (docs/modele-donnees.md §3).
 *
 * `term` is stored normalised — lower case, unaccented, one space between words
 * — by `normalizeSearchTerm` in `src/shared/search.ts`. The query normalises
 * its input with the same function; that shared definition is the whole
 * contract, and a term normalised any other way is a footballer nobody finds.
 *
 * Aliases enter the index and never the display: a suggestion always carries
 * `footballers.name`, so `Chicharito` finds Javier Hernández and the list says
 * "Javier Hernández".
 *
 * Two indexes for two different jobs, and the pair is deliberate: btree
 * `text_pattern_ops` serves the prefix, which is the dominant case, and GIN
 * trigrams serve typo tolerance. Trigrams alone are bad on short prefixes
 * (docs/modele-donnees.md §7).
 */
export const footballerNames = pgTable(
  'footballer_names',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    footballerId: uuid('footballer_id')
      .notNull()
      .references(() => footballers.id, { onDelete: 'cascade' }),
    /** Normalised. Never displayed — `footballers.name` is what a player sees. */
    term: text('term').notNull(),
    /** `false` = alias. Informational: the display never depends on it. */
    isCanonical: boolean('is_canonical').notNull().default(false),
  },
  (t) => [
    // What makes re-running the import a no-op, and what collapses the accent
    // variants Wikidata ships ("Zinédine Zidane" and "Zinedine Zidane" are one
    // term). Being led by `footballer_id`, it also serves the join and the
    // cascade, so there is no separate index on that column.
    uniqueIndex('footballer_names_footballer_id_term_key').on(t.footballerId, t.term),
    index('footballer_names_term_prefix_idx').using(
      'btree',
      t.term.asc().op('text_pattern_ops'),
    ),
    index('footballer_names_term_trgm_idx').using('gin', t.term.op('gin_trgm_ops')),
  ],
)

/**
 * One senior spell at one club. The same club crossed twice is two rows.
 *
 * There is deliberately no ordering column: a career sorts by
 * `(start_year, end_year, id)`. `id` is part of the key so the order is
 * *deterministic* — the sequence of clubs is part of the enigma, and two spells
 * starting the same year must not swap between two page loads.
 *
 * Years come from Wikidata raw and may overlap: a loan coexists with the parent
 * contract, so the durations can add up to more than the career. Assumed.
 */
export const playerClubs = pgTable(
  'player_clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    footballerId: uuid('footballer_id')
      .notNull()
      .references(() => footballers.id, { onDelete: 'cascade' }),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    /** An annotation next to the club, never a club of its own. */
    isLoan: boolean('is_loan').notNull().default(false),
    startYear: integer('start_year').notNull(),
    /** Null = career in progress. The displayed duration then keeps growing. */
    endYear: integer('end_year'),
    /** League matches only (`P1350`) — cups and European competitions excluded. */
    matches: integer('matches'),
    /** League goals only (`P1351`). */
    goals: integer('goals'),
  },
  (t) => [
    index('player_clubs_career_idx').on(t.footballerId, t.startYear, t.endYear),
  ],
)
