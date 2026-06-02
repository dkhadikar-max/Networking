-- Prevent duplicate connection pairs regardless of who initiated the match.
-- A regular UNIQUE constraint can't use functions, so we use an expression index.
-- LEAST/GREATEST normalises the pair so (alice,bob) and (bob,alice) map to the
-- same index entry — the DB rejects the second insert with error code 23505.
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_unique
  ON connections (LEAST(user1, user2), GREATEST(user1, user2));
