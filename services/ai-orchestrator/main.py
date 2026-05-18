"""
BYN AI Orchestrator — Service B
FastAPI + LangGraph. Python 3.11. No Node.js dependencies.
Communicates with Service A (main BYN app) only via HTTP.
"""
from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import Any

# ── Structured logging ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("orchestrator")

# ── Runtime config (all via env vars — no hardcoded secrets) ─────────────────
ORCHESTRATOR_SECRET = os.getenv("ORCHESTRATOR_SECRET", "")
PORT                = int(os.getenv("PORT", "8000"))
ALLOWED_TASK_TYPES  = {"seo_audit", "growth_strategy", "research", "qa_review"}

# ── Deferred singletons — populated in lifespan after uvicorn binds ──────────
_GRAPH         = None
_SB            = None   # supabase_client module
_STARTUP_ERROR = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _GRAPH, _SB, _STARTUP_ERROR
    log.info("=== BYN AI Orchestrator starting ===")
    log.info("Python runtime: isolated — no Node.js")

    # Validate required env vars before heavy imports
    required = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    missing  = [k for k in required if not os.getenv(k)]
    if missing:
        _STARTUP_ERROR = f"Missing env vars: {missing}"
        log.error(_STARTUP_ERROR)
        yield
        return

    try:
        import supabase_client as sb_mod
        _SB = sb_mod
        log.info("Supabase client: OK")

        from graph import build_graph
        _GRAPH = build_graph()
        log.info("LangGraph compiled: OK")
        log.info("  Nodes: planner → router → workers (parallel) → critic → retry/memory_update")
        log.info("  Checkpointer: MemorySaver (in-process, per-thread)")
        log.info("  Worker agents: ceo, backend, frontend, growth, security, qa, research, devops")
        log.info("=== Orchestrator ready ===")
    except Exception as exc:
        _STARTUP_ERROR = str(exc)
        log.exception("Startup failed: %s", exc)

    yield
    log.info("Orchestrator shutdown")


app = FastAPI(
    title="BYN AI Orchestrator",
    version="2.0.0",
    description="Service B — LangGraph autonomous agent workflows. Python 3.11 only.",
    lifespan=lifespan,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _graph():
    if _GRAPH is None:
        raise HTTPException(503, _STARTUP_ERROR or "Graph not ready — check /health")
    return _GRAPH

def _sb():
    if _SB is None:
        raise HTTPException(503, _STARTUP_ERROR or "Supabase not ready — check /health")
    return _SB

def require_auth(x_orchestrator_secret: str = Header(default="")):
    if ORCHESTRATOR_SECRET and x_orchestrator_secret != ORCHESTRATOR_SECRET:
        raise HTTPException(401, "Invalid orchestrator secret")

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _initial_state(execution_id: str, task_type: str, payload: dict) -> dict:
    return {
        "execution_id":    execution_id,
        "task_type":       task_type,
        "payload":         payload,
        "plan":            [],
        "parallel_groups": [],
        "worker_outputs":  {},
        "critic_score":    0.0,
        "critic_feedback": "",
        "retry_count":     0,
        "final_output":    "",
        "status":          "planning",
        "traces":          [],
        "tokens_total":    0,
    }


# ── Request / response models ─────────────────────────────────────────────────

class RunRequest(BaseModel):
    task_type: str
    payload:   dict[str, Any] = {}

class RunResponse(BaseModel):
    execution_id: str
    status:       str
    final_output: str
    critic_score: float
    tokens_total: int
    traces:       list[dict]


# ── Background runner ─────────────────────────────────────────────────────────

async def _execute_and_persist(execution_id: str, task_type: str, payload: dict):
    sb  = _sb()
    log.info("[%s] async execution started task_type=%s", execution_id, task_type)
    await sb.upsert_execution(execution_id, {
        "status":    "planning",
        "task_type": task_type,
        "payload":   payload,
    })
    cfg = {"configurable": {"thread_id": execution_id}}
    try:
        state = await _graph().ainvoke(_initial_state(execution_id, task_type, payload), config=cfg)
        log.info("[%s] completed score=%.2f tokens=%d", execution_id, state["critic_score"], state["tokens_total"])
        await sb.upsert_execution(execution_id, {
            "status":       state["status"],
            "final_output": state["final_output"],
            "critic_score": state["critic_score"],
            "tokens_total": state["tokens_total"],
            "completed_at": _now(),
        })
        for trace in state.get("traces", []):
            await sb.append_node_trace(execution_id, trace)
        await sb.save_checkpoint(execution_id, 999, dict(state))
    except Exception as exc:
        log.exception("[%s] execution failed: %s", execution_id, exc)
        await sb.upsert_execution(execution_id, {
            "status":       "failed",
            "error":        str(exc),
            "completed_at": _now(),
        })


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Railway health check — always 200. Error surfaced in body if degraded."""
    return {
        "status":  "degraded" if _STARTUP_ERROR else "ok",
        "service": "byn-ai-orchestrator",
        "version": "2.0.0",
        "runtime": "python3.11",
        "graph_ready": _GRAPH is not None,
        **({"error": _STARTUP_ERROR} if _STARTUP_ERROR else {}),
    }


@app.get("/agents")
async def list_agents(x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    return {
        "agents": ["ceo", "backend", "frontend", "growth", "security", "qa", "research", "devops"],
        "task_types": sorted(ALLOWED_TASK_TYPES),
    }


@app.post("/workflow", response_model=RunResponse)
async def run_workflow(req: RunRequest, x_orchestrator_secret: str = Header(default="")):
    """Synchronous workflow execution — waits for completion."""
    require_auth(x_orchestrator_secret)
    if req.task_type not in ALLOWED_TASK_TYPES:
        raise HTTPException(400, f"task_type must be one of {sorted(ALLOWED_TASK_TYPES)}")

    sb = _sb()
    execution_id = str(uuid.uuid4())
    log.info("[%s] sync workflow started task_type=%s", execution_id, req.task_type)
    await sb.upsert_execution(execution_id, {
        "status":    "planning",
        "task_type": req.task_type,
        "payload":   req.payload,
    })
    cfg = {"configurable": {"thread_id": execution_id}}
    try:
        state = await _graph().ainvoke(_initial_state(execution_id, req.task_type, req.payload), config=cfg)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("[%s] sync workflow failed: %s", execution_id, exc)
        raise HTTPException(500, str(exc))

    log.info("[%s] sync workflow completed score=%.2f tokens=%d", execution_id, state["critic_score"], state["tokens_total"])
    await sb.upsert_execution(execution_id, {
        "status":       state["status"],
        "final_output": state["final_output"],
        "critic_score": state["critic_score"],
        "tokens_total": state["tokens_total"],
        "completed_at": _now(),
    })
    for trace in state.get("traces", []):
        await sb.append_node_trace(execution_id, trace)

    return RunResponse(
        execution_id = execution_id,
        status       = state["status"],
        final_output = state["final_output"],
        critic_score = state["critic_score"],
        tokens_total = state["tokens_total"],
        traces       = state.get("traces", []),
    )


@app.post("/workflow/async")
async def run_workflow_async(
    req: RunRequest,
    background_tasks: BackgroundTasks,
    x_orchestrator_secret: str = Header(default=""),
):
    """Async workflow — returns immediately, runs graph in background."""
    require_auth(x_orchestrator_secret)
    if req.task_type not in ALLOWED_TASK_TYPES:
        raise HTTPException(400, f"task_type must be one of {sorted(ALLOWED_TASK_TYPES)}")

    _graph()  # fail fast if not ready
    execution_id = str(uuid.uuid4())
    log.info("[%s] async workflow queued task_type=%s", execution_id, req.task_type)
    background_tasks.add_task(_execute_and_persist, execution_id, req.task_type, req.payload)
    return {"execution_id": execution_id, "status": "queued"}


# Legacy aliases so admin.html keeps working without changes
@app.post("/run", response_model=RunResponse)
async def run_sync_alias(req: RunRequest, x_orchestrator_secret: str = Header(default="")):
    return await run_workflow(req, x_orchestrator_secret)

@app.post("/run/async")
async def run_async_alias(req: RunRequest, bg: BackgroundTasks, x_orchestrator_secret: str = Header(default="")):
    return await run_workflow_async(req, bg, x_orchestrator_secret)


@app.get("/execution/{execution_id}")
async def get_execution(execution_id: str, x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    sb = _sb().get_supabase()
    result = sb.table("langgraph_executions").select("*").eq("id", execution_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Execution not found")
    traces = sb.table("langgraph_node_traces").select("*").eq("execution_id", execution_id).order("created_at").execute()
    return {**result.data, "traces": traces.data or []}


@app.get("/executions")
async def list_executions(
    limit: int = 50,
    status: str = "",
    x_orchestrator_secret: str = Header(default=""),
):
    require_auth(x_orchestrator_secret)
    sb = _sb().get_supabase()
    q = (
        sb.table("langgraph_executions")
        .select("id,task_type,status,critic_score,tokens_total,created_at,completed_at")
        .order("created_at", desc=True)
        .limit(min(limit, 200))
    )
    if status:
        q = q.eq("status", status)
    result = q.execute()
    return {"executions": result.data or []}


@app.get("/graph/topology")
async def graph_topology(x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    return {
        "nodes": [
            {"id": "planner",       "type": "planner", "label": "Planner"},
            {"id": "router",        "type": "router",  "label": "Router"},
            {"id": "critic",        "type": "critic",  "label": "Critic"},
            {"id": "retry",         "type": "retry",   "label": "Retry"},
            {"id": "memory_update", "type": "memory",  "label": "Memory Update"},
            *[
                {"id": f"worker_{a}", "type": "worker", "label": a.title()}
                for a in ["ceo", "backend", "frontend", "growth", "security", "qa", "research", "devops"]
            ],
        ],
        "edges": [
            {"from": "START",         "to": "planner"},
            {"from": "planner",       "to": "router"},
            {"from": "router",        "to": "worker_*",      "type": "fan-out"},
            {"from": "worker_*",      "to": "critic",        "type": "fan-in"},
            {"from": "critic",        "to": "retry",         "condition": "score < threshold"},
            {"from": "critic",        "to": "memory_update", "condition": "score >= threshold"},
            {"from": "retry",         "to": "worker_*",      "type": "fan-out"},
            {"from": "memory_update", "to": "END"},
        ],
        "config": {
            "critic_threshold": float(os.getenv("CRITIC_THRESHOLD", "0.75")),
            "max_retries":      int(os.getenv("MAX_RETRIES", "2")),
            "allowed_task_types": sorted(ALLOWED_TASK_TYPES),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
