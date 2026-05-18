-- AI Operating System — Phase 2: Persistent Orchestrator
-- Run in Supabase SQL Editor after 003_agent_infrastructure.sql

-- ── Retry fields on agent_tasks (add if missing) ──
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS retry_count   int NOT NULL DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS max_retries   int NOT NULL DEFAULT 3;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS agent_tasks_retry_idx
  ON agent_tasks(status, next_retry_at)
  WHERE status = 'pending';

-- ── Multi-step workflow table ──
CREATE TABLE IF NOT EXISTS agent_workflows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  template      text NOT NULL,
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','paused')),
  steps         jsonb NOT NULL DEFAULT '[]',
  current_step  int  NOT NULL DEFAULT 0,
  context       jsonb NOT NULL DEFAULT '{}',
  error         text,
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS agent_workflows_status_idx
  ON agent_workflows(status, created_at DESC);

-- ── RLS ──
ALTER TABLE agent_workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON agent_workflows;
CREATE POLICY "service_role_only" ON agent_workflows FOR ALL TO service_role USING (true);
