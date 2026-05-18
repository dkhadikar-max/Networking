# BYN AI OS — LangGraph Phase 1

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BYN AI Operating System                          │
│                                                                     │
│   Node.js (Railway)              Python LangGraph (Railway)         │
│   ┌──────────────┐               ┌───────────────────────────┐      │
│   │  Express API  │◄────HTTP─────►│   FastAPI + LangGraph     │      │
│   │  admin routes │               │   services/ai-orchestrator│      │
│   │  /api/admin/  │               │   port: 8000              │      │
│   │  langgraph/*  │               └───────────┬───────────────┘      │
│   └──────────────┘                           │                      │
│          │                                   │                      │
│          └──────────────────┬────────────────┘                      │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │    Supabase     │                              │
│                    │ • agent_memory  │                              │
│                    │ • agent_tasks   │                              │
│                    │ • lg_executions │                              │
│                    │ • lg_traces     │                              │
│                    │ • lg_checkpoints│                              │
│                    └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Graph Topology

```
START
  │
  ▼
┌─────────┐
│ Planner │  — analyzes task, creates ordered execution plan with parallel groups
└────┬────┘
     │
  ▼
┌────────┐
│ Router │  — fans out to parallel worker group 1
└───┬────┘
    │
    ├──────────────────────────────────────────────┐
    ▼                    ▼                         ▼
┌─────────┐        ┌──────────┐             ┌──────────┐
│research │        │  growth  │             │    qa    │  (parallel)
└────┬────┘        └────┬─────┘             └────┬─────┘
     └──────────────────┴───────────────────────┘
                         │
                         ▼
                    ┌──────────┐
                    │  Critic  │  — scores output 0.0–1.0
                    └──────┬───┘
                           │
              ┌────────────┴────────────┐
         score < 0.75                score ≥ 0.75
         retries left                     │
              │                           ▼
              ▼                   ┌───────────────┐
          ┌───────┐               │ Memory Update │
          │ Retry │               └───────┬───────┘
          └───┬───┘                       │
              │ (re-run workers)          ▼
              └──────────────────────────END
```

## Service Structure

```
services/ai-orchestrator/
├── main.py              FastAPI app + REST endpoints
├── graph.py             LangGraph graph construction
├── state.py             GraphState TypedDict
├── config.py            Environment config
├── supabase_client.py   Supabase integration + checkpoint saver
├── nodes/
│   ├── planner.py       Analyzes task → execution plan
│   ├── workers.py       All 8 agent worker nodes (factory pattern)
│   ├── critic.py        Quality evaluation + confidence scoring
│   ├── retry.py         Retry counter + feedback injection
│   └── memory_update.py Extracts insights → agent_memory table
├── requirements.txt
├── railway.json         Railway deployment config
└── Procfile
```

## Deployment Strategy

### Step 1: Supabase migration
Run `migrations/005_langgraph_infrastructure.sql` in Supabase SQL Editor.

### Step 2: Deploy LangGraph service on Railway
1. In Railway dashboard → New Service → GitHub repo
2. Set root directory to `services/ai-orchestrator`
3. Set environment variables:
   ```
   ANTHROPIC_API_KEY=<your key>
   SUPABASE_URL=<same as Node.js service>
   SUPABASE_SERVICE_ROLE_KEY=<same as Node.js service>
   ORCHESTRATOR_SECRET=<generate a random 32-char string>
   PORT=8000
   ```

### Step 3: Link services
In the Node.js Railway service, add:
```
LANGGRAPH_URL=https://<langgraph-service>.railway.app
ORCHESTRATOR_SECRET=<same secret as above>
```

### Step 4: Verify
```
GET /api/admin/langgraph/status       → { enabled: true, reachable: true }
GET /api/admin/langgraph/topology     → graph node/edge map
```

## Rollback Plan

The LangGraph service is **fully additive** — the existing Node.js orchestrator continues to function independently.

| Scenario | Action |
|---|---|
| LangGraph service down | Node.js returns `{ enabled: true, reachable: false }` — existing agent system unaffected |
| Bad LangGraph deploy | Remove `LANGGRAPH_URL` from Node.js env — instant fallback |
| Supabase table issues | LangGraph tables are isolated — existing `agent_tasks` and workflows unaffected |
| Critical bug in graph | Unset `LANGGRAPH_URL` in Railway dashboard — zero downtime |

## Phase 1 Scope (implemented)

- [x] Planner node (claude-opus-4-7)
- [x] Router with fan-out to parallel workers
- [x] 8 worker nodes (all existing agents)
- [x] Critic node with confidence scoring
- [x] Retry node with feedback injection (max 2 retries)
- [x] Memory update node → agent_memory table
- [x] Supabase checkpoint persistence
- [x] FastAPI with sync + async execution endpoints
- [x] Node.js bridge (6 admin endpoints)
- [x] Execution dashboard data (traces, tokens, latency per node)
- [x] Task types: seo_audit, growth_strategy, research, qa_review

## Phase 2 (next)
- Admin.html LangGraph dashboard tab (execution tree visualisation)
- Streaming execution updates via WebSocket
- Additional task types (content_generation, security_audit)
- Redis for high-throughput task queuing (optional)
