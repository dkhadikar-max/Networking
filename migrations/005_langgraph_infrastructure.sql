-- LangGraph Phase 1 Infrastructure
-- Run in Supabase SQL Editor after 004_workflows.sql

-- ── Execution tracking ──
CREATE TABLE IF NOT EXISTS langgraph_executions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type     text NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','planning','running','blocked','retrying','failed','completed')),
  payload       jsonb NOT NULL DEFAULT '{}',
  final_output  text,
  critic_score  float,
  tokens_total  int,
  error         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS langgraph_executions_status_idx
  ON langgraph_executions(status, created_at DESC);

-- ── Node-level traces (one row per node per execution) ──
CREATE TABLE IF NOT EXISTS langgraph_node_traces (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id   uuid REFERENCES langgraph_executions(id) ON DELETE CASCADE,
  node           text NOT NULL,
  status         text NOT NULL DEFAULT 'completed',
  tokens_in      int  NOT NULL DEFAULT 0,
  tokens_out     int  NOT NULL DEFAULT 0,
  latency_ms     int  NOT NULL DEFAULT 0,
  output_preview text,
  error          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS langgraph_traces_exec_idx
  ON langgraph_node_traces(execution_id, created_at);

-- ── Checkpoint persistence ──
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  execution_id uuid  NOT NULL,
  step         int   NOT NULL,
  state        jsonb NOT NULL,
  saved_at     timestamptz DEFAULT now(),
  PRIMARY KEY (execution_id, step)
);

-- ── RLS: service_role only ──
ALTER TABLE langgraph_executions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph_node_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON langgraph_executions;
DROP POLICY IF EXISTS "service_role_only" ON langgraph_node_traces;
DROP POLICY IF EXISTS "service_role_only" ON langgraph_checkpoints;

CREATE POLICY "service_role_only" ON langgraph_executions  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON langgraph_node_traces FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON langgraph_checkpoints FOR ALL TO service_role USING (true);
