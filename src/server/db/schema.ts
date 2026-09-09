/**
 * Drizzle schema — the single definition of the database.
 *
 * Source of truth for the model: `docs/modele-donnees.md`. When this file and
 * that document disagree, the document wins and this file is the bug.
 *
 * This is the one file under `src/server/` without `import 'server-only'`:
 * drizzle-kit reads it from plain Node to generate migrations, and the
 * `server-only` marker throws outside a React Server Component graph. The
 * barrier is not lost — the ESLint boundary rule forbids `app/** -> server/db/**`
 * (see `eslint.config.mjs`), and nothing outside `server/` may import it.
 *
 * Scope: the catalogue only. Grid, enigma, player and operations tables arrive
 * with the tickets that need them (#6, #8, #13, #15).
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** Sporting nationality. One per footballer, even for a dual national. */
export const nationalities = pgTable(
  'nationalities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** ISO 3166-1 alpha-2, the natural key. */
    code: text('code').notNull(),
    frName: text('fr_name').notNull(),
    enName: text('en_name'),
    /** S3 object *key*, never a full URL: the bucket domain must be free to move. */
    flagS3Key: text('flag_s3_key'),
  },
  (t) => [uniqueIndex('nationalities_code_key').on(t.code)],
)

export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wikidataQid: text('wikidata_qid'),
    /** Current French name — the one the game displays. */
    frName: text('fr_name').notNull(),
    enName: text('en_name'),
    /** S3 object *key*, never a full URL. */
    logoS3Key: text('logo_s3_key'),
  },
  (t) => [uniqueIndex('clubs_wikidata_qid_key').on(t.wikidataQid)],
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
