/**
 * Drizzle schema — the single definition of the database.
 *
 * Source of truth for the model: `docs/modele-donnees.md`. When this file and
 * that document disagree, the document wins and this file is the bug.
 *
 * This file and `catalogue-schema.ts` beside it are the two under `src/server/`
 * without `import 'server-only'`: drizzle-kit reads them from plain Node to
 * generate migrations, and the `server-only` marker throws outside a React
 * Server Component graph. The barrier is not lost — the ESLint boundary rule
 * forbids `app/** -> server/db/**` (see `eslint.config.mjs`), and nothing
 * outside `server/` may import them.
 *
 * Scope: the grid and its enigmas — scheduling is what makes
 * the last two exist (#6) — plus `job_runs`, because the career import has to
 * leave a trace somewhere (#4), `players` and `player_progress`, which are the
 * joueur and his partie (#8), and `player_stats`, which is what his history
 * comes to (#10). The tables that aggregate a joueur's history arrive with the
 * tickets that read them — `pending_claims`, `users`, `sessions`, `accounts`
 * and `verifications` with le compte (#13).
 */
import {
  boolean,
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

import { footballers } from './catalogue-schema'

/**
 * Le catalogue vit dans son propre fichier et se réexporte ici : la dépendance
 * ne va que dans un sens — une énigme désigne un footballeur, et le catalogue
 * ne sait rien des grilles — donc la coupure ne crée pas de cycle. Rien d'autre
 * ne change : `import { clubs } from '@/server/db/schema'` continue de marcher,
 * et drizzle-kit voit les dix-huit tables d'un seul tenant.
 */
export * from './catalogue-schema'

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
    /**
     * Le compte, renseigné à l'inscription (#13). Null tant qu'il n'y en a pas,
     * et c'est le cas de la quasi-totalité des lignes : le jeu est jouable
     * entier sans compte (specs §6).
     *
     * `set null` à la suppression, et jamais une cascade : supprimer un compte
     * ne doit pas emporter les parties jouées avec. Le joueur redevient
     * l'anonyme qu'il était, ce qui est exactement ce que la colonne dit.
     */
    authUserId: text('auth_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
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
    /** Pas de défaut : l'archive est arrivée, et rien ne doit pouvoir oublier
     * de dire dans quel mode il joue. Écrit par `play.service.ts`, qui le
     * déduit de la date contre l'horloge du serveur (ADR-0016). */
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

/**
 * Les agrégats d'un joueur, un par mode (`docs/modele-donnees.md` §5).
 *
 * **Écrite dans la même transaction que la partie qu'elle compte**, et il n'y a
 * pas de job de réconciliation. La conséquence est à connaître plutôt qu'à
 * découvrir : un agrégat faux ne se répare pas tout seul la nuit suivante, donc
 * cette écriture se couvre par les tests comme une règle de jeu et non comme un
 * détail. C'est `server/services/play.service.ts` qui la tient, aux deux seuls
 * moments où une partie bouge — son ouverture et sa fin.
 *
 * ## Ce qui vit ici, et ce qui n'y vit pas
 *
 * Ce qui doit se lire en O(1) ou survivre à une purge. La **répartition par
 * nombre d'essais** n'est donc pas ici : c'est un `GROUP BY tries_used` sur les
 * `player_progress` résolues du joueur, qui en a au plus trois par jour (§9).
 * Le jour où les vieilles parties seront purgées, cette répartition ne portera
 * plus que sur la période conservée — et ces colonnes-ci, si.
 *
 * ## `mode` est dans la clé, et c'est la règle des specs §7
 *
 * L'archive est comptée séparément : « sinon une série de 200 jours se
 * reconstruit en une soirée ». Deux lignes par joueur au plus, et rien ne les
 * additionne jamais — il faudrait choisir laquelle des deux séries afficher.
 */
export const playerStats = pgTable(
  'player_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Pas de défaut, comme sur la partie : rien ne doit pouvoir oublier de dire. */
    mode: playMode('mode').notNull(),
    /** Toute partie ouverte compte, abandonnée comprise. Écrit à l'ouverture. */
    playedCount: integer('played_count').notNull().default(0),
    solvedCount: integer('solved_count').notNull().default(0),
    /** Les grilles dont les trois énigmes ont été trouvées. Indépendant de la série. */
    perfectChallenges: integer('perfect_challenges').notNull().default(0),
    /**
     * Les jours consécutifs où le **titulaire** a été trouvé — et seulement lui
     * (specs §5). Stockée, mais **remise à zéro à la lecture** : elle n'a de
     * sens qu'avec la colonne suivante, et rien ne la répare la nuit.
     */
    currentStreak: integer('current_streak').notNull().default(0),
    bestStreak: integer('best_streak').notNull().default(0),
    /**
     * La date de la dernière grille dont le titulaire a été trouvé — ce qui
     * porte la remise à zéro. Une `date` et non un timestamp, la même que
     * `daily_challenges.date` : on y compare des jours de Paris, jamais des
     * instants (`server/domain/stats.ts`).
     */
    lastSolvedChallenge: date('last_solved_challenge', { mode: 'string' }),
  },
  (t) => [
    // Un agrégat par joueur et par mode, et c'est cette contrainte qui fait de
    // l'upsert un verrou : deux parties du même joueur qui se terminent en même
    // temps se sérialisent sur cette ligne, donc le carton plein ne se perd pas
    // entre deux transactions qui se seraient chacune vue avant l'autre.
    uniqueIndex('player_stats_player_id_mode_key').on(t.playerId, t.mode),
  ],
)

/**
 * Le compte, et les trois tables que Better Auth tient avec lui (#13).
 *
 * Elles sont déclarées ici et non générées par la CLI de Better Auth, pour la
 * raison qui vaut pour tout le reste du modèle : le SQL des migrations est relu
 * par un humain et commité (`docs/stack-technique.md` §11). L'adaptateur
 * Drizzle reçoit ces quatre objets nommément — `usePlural`, ce qui aligne du
 * même coup les noms sur ceux du reste du schéma et évite de nommer une table
 * `user`, mot réservé que tout `psql` à la main devrait citer.
 *
 * **Aucune d'elles ne porte de progression.** Le joueur reste `players`, et le
 * compte n'est qu'un `auth_user_id` posé dessus (ADR-0003) : c'est ce qui fait
 * de la reprise un `UPDATE` d'une colonne, et c'est pour ça que le plugin
 * `anonymous` de Better Auth — qui supprime la ligne anonyme après liaison — a
 * été écarté.
 *
 * Les identifiants sont des `text` et non des `uuid` : Better Auth les fabrique
 * lui-même, et leur forme lui appartient.
 */
/**
 * Le rôle d'un compte, et la seule chose qui ouvre `/admin`.
 *
 * Deux valeurs, un défaut à `player`, et c'est le défaut qui porte la garantie :
 * Better Auth insère ses lignes sans connaître cette colonne, donc **toute
 * inscription crée un joueur**. Il n'y a pas de chemin par lequel on devient
 * admin en s'inscrivant ; il faut un `UPDATE` écrit à la main sur la base
 * (`pnpm admin:grant`), c'est-à-dire un accès que seul l'exploitant a.
 *
 * Un `pgEnum` et non un `text` libre : une faute de frappe dans un `UPDATE` de
 * production doit être refusée par la base plutôt que de créer silencieusement
 * un rôle que personne ne porte — ce qui, ici, laisserait quelqu'un dehors en
 * croyant l'avoir fait entrer.
 */
export const userRole = pgEnum('user_role', ['player', 'admin'])

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    /**
     * Jamais demandé, jamais affiché. Better Auth écrit `''` à l'inscription
     * par code comme par lien, et la colonne existe parce que son modèle la
     * veut — l'adresse est tout ce que ce jeu sait d'une personne.
     */
    name: text('name').notNull().default(''),
    email: text('email').notNull(),
    /**
     * Vraie dès l'inscription : le code et le lien sont tous deux la preuve que
     * la boîte a été ouverte. Il n'y a pas de mot de passe, donc pas de compte
     * créé avant sa vérification.
     */
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /**
     * Qui ouvre le back-office (ADR-0015). La colonne remplace `ADMIN_EMAILS` :
     * le rôle suit la personne dans la base qu'on sauvegarde, au lieu de vivre
     * dans un environnement qu'un redéploiement est nécessaire pour changer.
     *
     * Better Auth ne la connaît pas et ne l'écrit jamais : elle n'est pas dans
     * les champs qu'on lui déclare, et son `INSERT` prend donc le défaut. Ce qui
     * l'écrit est un `UPDATE` à la main, et rien d'autre dans le code.
     */
    role: userRole('role').notNull().default('player'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Pas d'index sur le rôle : les deux seules questions posées à cette colonne
  // sont « ce compte-ci est-il admin » et « cette adresse-ci est-elle admin »,
  // qui atteignent toutes deux une ligne par la clé primaire ou par
  // `users_email_key` avant de la lire. Un index sur `role` ne serait jamais
  // choisi.
  (t) => [uniqueIndex('users_email_key').on(t.email)],
)

/**
 * Une session ouverte — 180 jours glissants (`docs/stack-technique.md` §4bis).
 *
 * La durée est celle d'un jeu d'habitude quotidienne : redemander un email tous
 * les quinze jours serait contre-productif, et le compte ne contient que des
 * statistiques. `token` est ce que porte le cookie, et il est unique : c'est la
 * seule chose qui fasse d'un porteur un titulaire.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.token),
    // Ce que lit une déconnexion « partout », et ce que suit la cascade.
    index('sessions_user_id_idx').on(t.userId),
  ],
)

/**
 * Le lien entre un compte et le moyen de s'y connecter.
 *
 * Vide, ou presque, dans ce jeu : il n'y a ni mot de passe ni fournisseur
 * social, et une connexion par code ou par lien n'en écrit pas. Elle est là
 * parce que le modèle de Better Auth la suppose — supprimer un compte la lit —
 * et parce qu'une table absente ne se découvre qu'au premier chemin qui la
 * touche, en production.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
)

/**
 * Ce qui a été envoyé et attend d'être présenté : le code à six chiffres, le
 * jeton du lien magique. Dix minutes, usage unique.
 *
 * `identifier` porte l'adresse (préfixée par le plugin), `value` le secret tel
 * que Better Auth choisit de le ranger — haché, ici, des deux côtés : un dump
 * de cette table ne doit pas être une liste de codes valides.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Toute lecture se fait par identifiant, et le balayage des expirés par
    // date. Les deux sont ici plutôt qu'un seul : la table est écrite à chaque
    // demande et lue à chaque validation.
    index('verifications_identifier_idx').on(t.identifier),
    index('verifications_expires_at_idx').on(t.expiresAt),
  ],
)

/**
 * La reprise de progression, enregistrée pendant que le cookie est encore là
 * (`docs/modele-donnees.md` §5, `docs/stack-technique.md` §4bis).
 *
 * C'est la table qui fait marcher le cas que le lien magique crée et que le
 * code évite : le lien s'ouvre dans le navigateur du client mail, pas dans
 * celui où l'on jouait, donc le cookie d'identité anonyme n'est pas là au
 * moment de la connexion. Une reprise faite « depuis le cookie au callback »
 * perdrait exactement la progression que les specs §6 promettent de garder.
 *
 * Alors l'association est écrite **à la demande du code ou du lien**, dans
 * l'onglet du jeu, où le cookie est présent. La connexion, ensuite, n'a qu'à
 * lire : elle trouve le joueur par l'adresse, où qu'elle se produise.
 *
 * Une ligne par (adresse, joueur), et redemander un code ne fait que repousser
 * son expiration : sans cela, un joueur indécis laisserait une ligne par envoi.
 */
export const pendingClaims = pgTable(
  'pending_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('pending_claims_email_player_id_key').on(t.email, t.playerId),
    // La lecture de la connexion : « quelle progression attend cette adresse ».
    index('pending_claims_email_idx').on(t.email),
  ],
)
