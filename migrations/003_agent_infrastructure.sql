-- AI Operating System — Phase 1 Infrastructure
-- Run in Supabase SQL Editor (service role only — no direct client access)

-- ── TASK QUEUE ──
CREATE TABLE IF NOT EXISTS agent_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  agent         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
  priority      int  NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  payload       jsonb NOT NULL DEFAULT '{}',
  result        jsonb,
  error         text,
  tokens_used   int,
  duration_ms   int,
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS agent_tasks_status_idx
  ON agent_tasks(status, priority, created_at);
CREATE INDEX IF NOT EXISTS agent_tasks_agent_idx
  ON agent_tasks(agent, created_at DESC);

-- ── PERSISTENT MEMORY ──
CREATE TABLE IF NOT EXISTS agent_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent       text NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL,
  category    text NOT NULL DEFAULT 'general'
                CHECK (category IN ('insight','decision','fact','preference','general')),
  confidence  float NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (agent, key)
);

CREATE INDEX IF NOT EXISTS agent_memory_agent_idx ON agent_memory(agent, category);

-- ── EXECUTION LOGS ──
CREATE TABLE IF NOT EXISTS agent_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES agent_tasks(id) ON DELETE CASCADE,
  agent      text NOT NULL,
  level      text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message    text NOT NULL,
  metadata   jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_logs_task_idx ON agent_logs(task_id, created_at);

-- ── RLS: block anon/authenticated direct access, allow service_role only ──
ALTER TABLE agent_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs   ENABLE ROW LEVEL SECURITY;

-- Drop if re-running
DROP POLICY IF EXISTS "service_role_only" ON agent_tasks;
DROP POLICY IF EXISTS "service_role_only" ON agent_memory;
DROP POLICY IF EXISTS "service_role_only" ON agent_logs;

CREATE POLICY "service_role_only" ON agent_tasks  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON agent_memory FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON agent_logs   FOR ALL TO service_role USING (true);
