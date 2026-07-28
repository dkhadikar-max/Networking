-- Circle Groups — joinable communities within Circles (Twitter-Communities style),
-- distinct from the existing global/tag-filtered feed. A post with group_id NULL
-- stays in the existing global feed; a post with group_id set belongs to that
-- group's own feed instead.

CREATE TABLE IF NOT EXISTS circle_groups (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  photo_url   text,
  privacy     text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private')),
  creator_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS circle_groups_creator_id_idx ON circle_groups(creator_id);

CREATE TABLE IF NOT EXISTS circle_group_members (
  id        text PRIMARY KEY,
  group_id  text NOT NULL REFERENCES circle_groups(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS circle_group_members_group_id_idx ON circle_group_members(group_id);
CREATE INDEX IF NOT EXISTS circle_group_members_user_id_idx ON circle_group_members(user_id);

ALTER TABLE circle_posts ADD COLUMN IF NOT EXISTS group_id text REFERENCES circle_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS circle_posts_group_id_idx ON circle_posts(group_id);

ALTER TABLE circle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_group_members ENABLE ROW LEVEL SECURITY;
