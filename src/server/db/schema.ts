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
 * Scope: the catalogue, the grid and its enigmas — scheduling is what makes
 * the last two exist (#6) — plus `job_runs`, because the career import has to
 * leave a trace somewhere (#4), and `players` and `player_progress`, which are
 * the joueur and his partie (#8). The tables that aggregate a joueur's history
 * arrive with the tickets that read them: `player_stats` with the série and the
 * cartons pleins (#10), `pending_claims` with the account (#13).
 */
import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

/**
 * The life of a grid (`docs/modele-donnees.md` §2).
 *
 * `draft` is the column default, but the scheduling screen never leaves a grid
 * there: it writes a date, a theme and three enigmas in one transaction, so a
 * row exists only once it is complete. The default is what protects a row
 * inserted by any other hand.
 */
export const dailyChallengeStatus = pgEnum('daily_challenge_status', [
  'draft',
  'scheduled',
  'published',
])

/**
 * One row per programmed date — the grid.
 *
 * **The absence of a row is the hole**: there is no "gap" table and no status
 * meaning "nothing planned". The month view, the weekly alert job (#14) and the
 * health route (#15) all read the same absence.
 *
 * `date` is a `date` and not a timestamp. The grid of the day is
 * `WHERE date = <today in Paris>`, computed lazily rather than by a midnight
 * job — which would fall exactly on the traffic peak — and a column with no
 * time carries no zone to disagree about.
 *
 * The theme lives here because it qualifies the whole day and never a single
 * enigma. It is free text rather than an enum, and **no automatic check
 * attaches to it** (specs §4): any theme any day, a Friday may be perfectly
 * standard, and nothing verifies that the three footballers match what it
 * announces. The scheduling screen offers the values already used; it does not
 * impose them.
 */
export const dailyChallenges = pgTable(
  'daily_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Europe/Paris date, `YYYY-MM-DD`. Read as a string all the way down. */
    date: date('date', { mode: 'string' }).notNull(),
    theme: text('theme').notNull().default('standard'),
    status: dailyChallengeStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('daily_challenges_date_key').on(t.date)],
)

/**
 * One of the three enigmas of a grid — a **designation**, not a copy.
 *
 * Three useful columns and nothing else (ADR-0001): the parcours, the
 * durations, the matches, the goals and the nationality the player sees are
 * read from `player_clubs`, `clubs` and `footballers` at render time. There is
 * no `career_snapshot` and there must never be one — correcting a career
 * corrects every enigma at once, and there are never two versions of a parcours
 * to reconcile.
 *
 * The consequence is assumed and has no guard rail: an import that changes a
 * parcours changes every grid the footballer appears in, archive grids and
 * games in progress included.
 *
 * `footballer_id` restricts rather than cascades. Deleting a footballer who
 * carries an enigma would silently empty a grid — possibly a published one — so
 * the delete is refused and a human decides what the grid becomes instead.
 */
export const challengeItems = pgTable(
  'challenge_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dailyChallengeId: uuid('daily_challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'cascade' }),
    /** 1 échauffement, 2 titulaire, 3 légende. Difficulty decided by hand. */
    position: integer('position').notNull(),
    /** The answer, and the only thing the enigma knows about the footballer. */
    footballerId: uuid('footballer_id')
      .notNull()
      .references(() => footballers.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // One index, the one `docs/modele-donnees.md` §7 asks for. There is
  // deliberately none on `footballer_id`: nothing reads an enigma by
  // footballer, and the only scan it would spare is the `restrict` check on a
  // table that grows by about a thousand rows a year.
  (t) => [
    // Three enigmas per grid, one per position. This is what makes scheduling
    // idempotent: replacing a grid rewrites the same three rows.
    uniqueIndex('challenge_items_daily_challenge_id_position_key').on(
      t.dailyChallengeId,
      t.position,
    ),
  ],
)

/**
 * One line per run of something the admin may later have to explain: an import,
 * a periodic job (#14). `docs/modele-donnees.md` §6.
 *
 * It is written outside the transaction it describes, and on the way out as
 * well as on the way in: a run that failed and left nothing behind is exactly
 * the run worth reading, so a rollback must not take its trace with it.
 *
 * `target` is not in the model document's first draft: the career import runs
 * for one footballer at a time, and a row saying "career_import, 7 items" tells
 * the diagnostic screen nothing about *whom* it ran for. It holds the Wikidata
 * id, and is null for a job that has no single subject.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    /** What the run was about — a footballer's Wikidata id for an import. */
    target: text('target'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while the run is in flight. Set even when it failed. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Volume handled — passages written, for a career import. */
    items: integer('items'),
    errors: integer('errors'),
    /**
     * What went wrong, in the words the caller got. Also not in the model
     * document's first draft: `errors = 1` says a run failed and a diagnostic
     * screen then has nothing to show. The message is truncated, and it is the
     * message only — never a stack.
     */
    lastError: text('last_error'),
  },
  (t) => [index('job_runs_job_started_at_idx').on(t.job, t.startedAt.desc())],
)

/**
 * How a partie is played (`docs/modele-donnees.md` §2).
 *
 * Only the quotidien feeds the série and the cartons pleins (specs §7), which
 * is why the mode is a column of the partie and not a property of the grid: the
 * same grid is the grid of the day once and an archive grid forever after.
 */
export const playMode = pgEnum('play_mode', ['daily', 'archive'])

/**
 * The issue of a partie — but only the *stored* one.
 *
 * `in_progress` is not the same thing as "still playable": a partie left open
 * on a grid that is no longer the grid of the day is **read** as `failed`, by a
 * rule and not by a job (`docs/modele-donnees.md` §4). That rule lives in
 * `server/domain/play.ts`, and it is the reason nothing in this application
 * ever writes `failed` at midnight.
 */
export const playStatus = pgEnum('play_status', ['in_progress', 'solved', 'failed'])

/**
 * A joueur — with or without an account (ADR-0003).
 *
 * The identity is an UUID in a cookie (`cookie_id`) and **not** Better Auth's
 * `anonymous` plugin: that plugin opens an authentication session per visitor
 * and deletes the anonymous row on linking, which would erase exactly the
 * progression the specs promise to carry over. So the reprise de progression is
 * an `UPDATE players SET auth_user_id` (#13) and never a data migration —
 * everything that points at a joueur points at `players.id` and does not move.
 *
 * The cookie is *strictly necessary* to the service asked for: no consent
 * banner, 13 months rolling, and the purge of this table follows the same
 * duration. The constraint that comes with it, and that must not be broken
 * later: **no cookie-based analytics tracker** anywhere on the site, or the
 * banner comes back — and a joueur who refuses it loses his progression.
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The anonymous identity: the UUID the browser carries. Never displayed. */
    cookieId: text('cookie_id').notNull(),
    /** Better Auth's user id, filled in at sign-up (#13). Null until then. */
    authUserId: text('auth_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every personal read. The only thing the purge can go on. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // What makes resolving a cookie into a joueur one statement, and what makes
    // two concurrent first requests from the same browser one row.
    uniqueIndex('players_cookie_id_key').on(t.cookieId),
    uniqueIndex('players_auth_user_id_key').on(t.authUserId),
    // Purge: no account, no partie, not seen for 13 months.
    index('players_last_seen_at_idx').on(t.lastSeenAt),
  ],
)

/**
 * La partie: one joueur's state on one enigma (`docs/modele-donnees.md` §4).
 *
 * **One mutable row, never a journal.** The unique index is what says so: an
 * essai updates this row, and the distribution by number of essais is a
 * `GROUP BY tries_used` over these rows — not a `game_events` table, which
 * would be ~450 M rows a year for an answer this shape already gives (§9).
 *
 * A row is written **when the enigma is opened**, not at the first essai. That
 * is what measures the people *exposed* to an enigma, which is what the
 * difficulty calibration of #12 reads. The interface corollary is not optional:
 * the three enigmas must not unfold at once, or three parties are born where
 * one person arrived.
 *
 * `tries_used` counts everything the player spends — a wrong footballer, a
 * footballer already tried, a skipped turn (specs §3). There is no
 * `skips_used`, and a skip is not distinguishable from an error here.
 */
export const playerProgress = pgTable(
  'player_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challengeItemId: uuid('challenge_item_id')
      .notNull()
      .references(() => challengeItems.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** No default: the day the archive arrives (#14), nothing may forget to say. */
    mode: playMode('mode').notNull(),
    /** 0 to 6. Everything consumes one, skipping a turn included. */
    triesUsed: integer('tries_used').notNull().default(0),
    status: playStatus('status').notNull().default('in_progress'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while the partie is open. Never set by a job. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /**
     * The last footballer proposed, and when — **anti-double-click, not a game
     * rule** (`docs/stack-technique.md` §4). Proposing a footballer already
     * tried costs an essai; the same proposition arriving twice within two
     * seconds costs nothing. The two mechanisms are easy to confuse and are
     * opposites. Written by #9; the columns are here because they belong to
     * this row and not because this ticket fills them.
     *
     * `set null` on delete: it is a marker, and a footballer leaving the
     * catalogue must not make a delete fail over a two-second window.
     */
    lastGuessFootballerId: uuid('last_guess_footballer_id').references(
      () => footballers.id,
      { onDelete: 'set null' },
    ),
    lastGuessAt: timestamp('last_guess_at', { withTimezone: true }),
  },
  (t) => [
    // The heart of it: one row per (enigma, joueur). Opening an enigma twice —
    // two tabs, a double request, a reload — cannot make a second partie, and
    // that is a constraint rather than a check in the service.
    uniqueIndex('player_progress_challenge_item_id_player_id_key').on(
      t.challengeItemId,
      t.playerId,
    ),
    // Personal history and statistics (#10, #12), read by joueur.
    index('player_progress_player_id_opened_at_idx').on(t.playerId, t.openedAt.desc()),
  ],
)
