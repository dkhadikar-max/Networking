"""
BYN AI OS — LangGraph Orchestrator Service
FastAPI app exposing workflow execution + dashboard endpoints.

All endpoints are called by the Node.js backend (admin routes) or directly from admin.html.
Auth: shared ORCHESTRATOR_SECRET header (set in Railway environment).
"""
from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import Any

# ── All domain imports deferred to lifespan so uvicorn always binds ──
_GRAPH          = None
_STARTUP_ERROR  = ""
_supabase_mod   = None

ORCHESTRATOR_SECRET = os.getenv("ORCHESTRATOR_SECRET", "")
PORT                = int(os.getenv("PORT", "8000"))
ALLOWED_TASK_TYPES  = {"seo_audit", "growth_strategy", "research", "qa_review"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _GRAPH, _STARTUP_ERROR, _supabase_mod
    try:
        import supabase_client as _supabase_mod   # noqa: F401
        from graph import build_graph
        _GRAPH = build_graph()
    except Exception as exc:
        _STARTUP_ERROR = str(exc)
    yield


app = FastAPI(title="BYN AI Orchestrator", version="1.0.0", lifespan=lifespan)


# ── Helpers ──

def _graph():
    if _GRAPH is None:
        detail = _STARTUP_ERROR or "Graph not ready"
        raise HTTPException(503, detail)
    return _GRAPH

def _sb():
    if _supabase_mod is None:
        raise HTTPException(503, _STARTUP_ERROR or "Supabase not ready")
    return _supabase_mod

def require_auth(x_orchestrator_secret: str = Header(default="")):
    if ORCHESTRATOR_SECRET and x_orchestrator_secret != ORCHESTRATOR_SECRET:
        raise HTTPException(status_code=401, detail="Invalid orchestrator secret")


# ── Request/response models ──

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


# ── Background execution runner ──

async def _execute_and_persist(execution_id: str, task_type: str, payload: dict):
    sb = _sb()
    initial = {
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

    await sb.upsert_execution(execution_id, {"status": "planning", "task_type": task_type, "payload": payload})

    lg_config = {"configurable": {"thread_id": execution_id}}
    try:
        final_state = await _graph().ainvoke(initial, config=lg_config)
        await sb.upsert_execution(execution_id, {
            "status":       final_state["status"],
            "final_output": final_state["final_output"],
            "critic_score": final_state["critic_score"],
            "tokens_total": final_state["tokens_total"],
            "completed_at": datetime.utcnow().isoformat(),
        })
        for trace in final_state.get("traces", []):
            await sb.append_node_trace(execution_id, trace)
        await sb.save_checkpoint(execution_id, 999, dict(final_state))
    except Exception as e:
        await sb.upsert_execution(execution_id, {
            "status": "failed",
            "error":  str(e),
            "completed_at": datetime.utcnow().isoformat(),
        })


# ── Routes ──

@app.get("/health")
async def health():
    return {
        "status":  "degraded" if _STARTUP_ERROR else "ok",
        "service": "byn-ai-orchestrator",
        "version": "1.0.0",
        **({"error": _STARTUP_ERROR} if _STARTUP_ERROR else {}),
    }


@app.post("/run", response_model=RunResponse)
async def run_sync(req: RunRequest, x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    if req.task_type not in ALLOWED_TASK_TYPES:
        raise HTTPException(400, f"task_type must be one of {sorted(ALLOWED_TASK_TYPES)}")

    sb = _sb()
    execution_id = str(uuid.uuid4())
    initial = {
        "execution_id":    execution_id,
        "task_type":       req.task_type,
        "payload":         req.payload,
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

    await sb.upsert_execution(execution_id, {"status": "planning", "task_type": req.task_type, "payload": req.payload})

    lg_config = {"configurable": {"thread_id": execution_id}}
    try:
        final_state = await _graph().ainvoke(initial, config=lg_config)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

    await sb.upsert_execution(execution_id, {
        "status":       final_state["status"],
        "final_output": final_state["final_output"],
        "critic_score": final_state["critic_score"],
        "tokens_total": final_state["tokens_total"],
        "completed_at": datetime.utcnow().isoformat(),
    })
    for trace in final_state.get("traces", []):
        await sb.append_node_trace(execution_id, trace)

    return RunResponse(
        execution_id = execution_id,
        status       = final_state["status"],
        final_output = final_state["final_output"],
        critic_score = final_state["critic_score"],
        tokens_total = final_state["tokens_total"],
        traces       = final_state.get("traces", []),
    )


@app.post("/run/async")
async def run_async(req: RunRequest, background_tasks: BackgroundTasks, x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    if req.task_type not in ALLOWED_TASK_TYPES:
        raise HTTPException(400, f"task_type must be one of {sorted(ALLOWED_TASK_TYPES)}")

    _graph()  # fail fast if not ready
    execution_id = str(uuid.uuid4())
    background_tasks.add_task(_execute_and_persist, execution_id, req.task_type, req.payload)
    return {"execution_id": execution_id, "status": "queued"}


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
async def list_executions(limit: int = 50, status: str = "", x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    sb = _sb().get_supabase()
    q = sb.table("langgraph_executions").select(
        "id,task_type,status,critic_score,tokens_total,created_at,completed_at"
    ).order("created_at", desc=True).limit(min(limit, 200))
    if status:
        q = q.eq("status", status)
    result = q.execute()
    return {"executions": result.data or []}


@app.get("/graph/topology")
async def graph_topology(x_orchestrator_secret: str = Header(default="")):
    require_auth(x_orchestrator_secret)
    return {
        "nodes": [
            {"id": "planner",       "type": "planner",  "label": "Planner"},
            {"id": "router",        "type": "router",   "label": "Router"},
            {"id": "critic",        "type": "critic",   "label": "Critic"},
            {"id": "retry",         "type": "retry",    "label": "Retry"},
            {"id": "memory_update", "type": "memory",   "label": "Memory Update"},
            *[{"id": f"worker_{a}", "type": "worker",   "label": a.title()} for a in ["ceo","backend","frontend","growth","security","qa","research","devops"]],
        ],
        "edges": [
            {"from": "START",         "to": "planner"},
            {"from": "planner",       "to": "router"},
            {"from": "router",        "to": "worker_*",     "type": "fan-out"},
            {"from": "worker_*",      "to": "critic",       "type": "fan-in"},
            {"from": "critic",        "to": "retry",        "condition": "score < threshold"},
            {"from": "critic",        "to": "memory_update","condition": "score >= threshold"},
            {"from": "retry",         "to": "worker_*",     "type": "fan-out"},
            {"from": "memory_update", "to": "END"},
        ],
        "config": {
            "critic_threshold": float(os.getenv("CRITIC_THRESHOLD", "0.75")),
            "max_retries":      int(os.getenv("MAX_RETRIES", "2")),
            "allowed_task_types": sorted(ALLOWED_TASK_TYPES),
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
