-- Les parties déjà ouvertes avant que cette table n'existe.
--
-- Écrite à la main : `drizzle-kit` ne génère que des différences de schéma, et
-- ce qui manque ici est une donnée. C'est la **seule** réconciliation que le
-- modèle autorise (`docs/modele-donnees.md` §5) — celle du jour où l'agrégat
-- apparaît — et elle a lieu une fois, dans la transaction de la migration.
--
-- Sans elle, un joueur qui avait des parties en cours partirait à
-- `played_count = 0`, pendant que la première réussite ferait `solved_count = 1`
-- : un taux de réussite au-dessus de 100 %, que rien ne viendrait réparer.
--
-- `ON CONFLICT DO NOTHING` parce qu'une ligne déjà là a été écrite par le jeu
-- lui-même, et que le jeu a raison contre une reconstruction.
INSERT INTO "player_stats" (
  "player_id", "mode", "played_count", "solved_count",
  "perfect_challenges", "current_streak", "best_streak", "last_solved_challenge"
)
WITH parties AS (
  SELECT pp.player_id, pp.mode, pp.status, ci.position, dc.date, dc.id AS grid_id
  FROM player_progress pp
  JOIN challenge_items ci ON ci.id = pp.challenge_item_id
  JOIN daily_challenges dc ON dc.id = ci.daily_challenge_id
),
-- Toute partie ouverte compte comme jouée, abandonnée comprise (specs §5).
counts AS (
  SELECT player_id, mode,
         count(*)::int AS played,
         (count(*) FILTER (WHERE status = 'solved'))::int AS solved
  FROM parties
  GROUP BY player_id, mode
),
-- Le carton plein : les trois énigmes d'une grille trouvées, et la grille en a
-- bien trois. Le 3 est écrit ici parce que le SQL n'a pas de constante à lire ;
-- il dit la même chose que `POSITIONS.length` dans `stats.service.ts`.
perfect_grids AS (
  SELECT p.player_id, p.mode, p.grid_id
  FROM parties p
  GROUP BY p.player_id, p.mode, p.grid_id
  HAVING count(*) FILTER (WHERE p.status = 'solved') = 3
     AND (SELECT count(*) FROM challenge_items c WHERE c.daily_challenge_id = p.grid_id) = 3
),
perfects AS (
  SELECT player_id, mode, count(*)::int AS perfect
  FROM perfect_grids
  GROUP BY player_id, mode
),
-- La série : les jours où le titulaire a été trouvé, dans le quotidien seul.
titulaires AS (
  SELECT DISTINCT player_id, date
  FROM parties
  WHERE mode = 'daily' AND status = 'solved' AND position = 2
),
-- Des jours consécutifs donnent la même valeur à `date - rang`, ce qui est
-- l'astuce entière : chaque suite ininterrompue devient un groupe.
islands AS (
  SELECT player_id, date,
         date - (row_number() OVER (PARTITION BY player_id ORDER BY date))::int AS island
  FROM titulaires
),
runs AS (
  SELECT player_id, island, count(*)::int AS length, max(date) AS last_date
  FROM islands
  GROUP BY player_id, island
),
series AS (
  SELECT player_id,
         max(length) AS best,
         -- La suite la plus récente : c'est elle que la lecture remettra à zéro
         -- si son dernier jour n'est ni aujourd'hui ni hier.
         (array_agg(length ORDER BY last_date DESC))[1] AS current,
         max(last_date) AS last_solved
  FROM runs
  GROUP BY player_id
)
SELECT
  c.player_id,
  c.mode,
  c.played,
  c.solved,
  COALESCE(p.perfect, 0),
  CASE WHEN c.mode = 'daily' THEN COALESCE(s.current, 0) ELSE 0 END,
  CASE WHEN c.mode = 'daily' THEN COALESCE(s.best, 0) ELSE 0 END,
  CASE WHEN c.mode = 'daily' THEN s.last_solved ELSE NULL END
FROM counts c
LEFT JOIN perfects p ON p.player_id = c.player_id AND p.mode = c.mode
LEFT JOIN series s ON s.player_id = c.player_id
ON CONFLICT ("player_id", "mode") DO NOTHING;
