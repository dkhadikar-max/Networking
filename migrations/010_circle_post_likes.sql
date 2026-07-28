-- Lightweight like/reaction on Circle posts.
-- "Collaborate" (existing) is a heavyweight action — it opens a DM composer.
-- Likes give a zero-commitment way to acknowledge a post, matching same table
-- conventions as circle_posts (text PK, text FK to users).

CREATE TABLE IF NOT EXISTS circle_post_likes (
  id         text PRIMARY KEY,
  post_id    text NOT NULL REFERENCES circle_posts(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS circle_post_likes_post_id_idx ON circle_post_likes(post_id);
CREATE INDEX IF NOT EXISTS circle_post_likes_user_id_idx ON circle_post_likes(user_id);

ALTER TABLE circle_post_likes ENABLE ROW LEVEL SECURITY;
