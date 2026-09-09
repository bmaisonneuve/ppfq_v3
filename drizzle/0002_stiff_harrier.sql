-- The ranking index widens from `(sitelinks DESC)` to `(sitelinks DESC, name,
-- id)`: those three columns are exactly what the typeahead orders by, so
-- Postgres can walk the referential in ranked order and stop at the tenth
-- match. Without them it aggregates every name matching a two-letter prefix and
-- sorts the lot — 117 ms measured on the real extract, against 0.8 ms with it.
--
-- NULLS FIRST matters even though `sitelinks` is NOT NULL: `ORDER BY sitelinks
-- DESC` means DESC NULLS FIRST, and an index declared NULLS LAST cannot supply
-- that ordering, which silently costs the early stop.
DROP INDEX "footballers_sitelinks_idx";--> statement-breakpoint
CREATE INDEX "footballers_ranking_idx" ON "footballers" USING btree ("sitelinks" DESC NULLS FIRST,"name","id");