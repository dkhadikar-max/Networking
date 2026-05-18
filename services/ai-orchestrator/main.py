"""
BYN AI Orchestrator — Service B
FastAPI + LangGraph. Python 3.11. No Node.js dependencies.
Communicates with Service A (main BYN app) only via HTTP.
"""
from __future__ import annotations

import asyncio
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

async def _heartbeat(execution_id: str, stop_event: asyncio.Event):
    """Logs every 5 seconds while a graph execution is in progress."""
    elapsed = 0
    while not stop_event.is_set():
        await asyncio.sleep(5)
        elapsed += 5
        if not stop_event.is_set():
            log.info("[%s] heartbeat elapsed=%ds (graph still running)", execution_id, elapsed)


async def _execute_and_persist(execution_id: str, task_type: str, payload: dict):
    sb  = _sb()
    log.info("[%s] async execution started task_type=%s", execution_id, task_type)
    try:
        await sb.upsert_execution(execution_id, {
            "status":    "planning",
            "task_type": task_type,
            "payload":   payload,
        })
    except Exception as exc:
        log.exception("[%s] failed to write initial status: %s", execution_id, exc)
        return

    cfg = {"configurable": {"thread_id": execution_id}}
    stop_hb = asyncio.Event()
    hb_task = asyncio.create_task(_heartbeat(execution_id, stop_hb))
    step = 0
    final_state: dict = {}
    try:
        log.info("[%s] graph.astream starting — watching each node event", execution_id)
        # stream_mode="updates" yields {node_name: state_delta} after each node completes.
        # This gives per-node visibility and lets us update DB status after each node.
        async for chunk in _graph().astream(
            _initial_state(execution_id, task_type, payload),
            config=cfg,
            stream_mode="updates",
        ):
            step += 1
            for node_name, node_update in chunk.items():
                update_keys = list(node_update.keys()) if isinstance(node_update, dict) else []
                log.info("[%s] STEP %d node_completed=%s update_keys=%s",
                         execution_id, step, node_name, update_keys)

                # Determine intermediate status from the node that just completed
                if node_name == "planner":
                    mid_status = "running"
                elif node_name == "router":
                    mid_status = "running"
                elif node_name.startswith("worker_"):
                    mid_status = "running"
                elif node_name == "critic":
                    mid_status = "running"
                elif node_name == "retry":
                    mid_status = "retrying"
                elif node_name == "memory_update":
                    mid_status = "completed"
                else:
                    mid_status = "running"

                # Persist intermediate status after each node
                try:
                    await sb.upsert_execution(execution_id, {"status": mid_status})
                except Exception as se:
                    log.warning("[%s] intermediate DB update failed after %s: %s",
                                execution_id, node_name, se)

                # Print trace preview for planner so we can see what plan was built
                if node_name == "planner" and isinstance(node_update, dict):
                    log.info("[%s] planner plan=%s parallel_groups=%s",
                             execution_id,
                             node_update.get("plan", []),
                             node_update.get("parallel_groups", []))

                # Merge into final_state (accumulate all deltas)
                if isinstance(node_update, dict):
                    for k, v in node_update.items():
                        if k == "traces" and isinstance(v, list):
                            final_state.setdefault("traces", [])
                            final_state["traces"] = final_state["traces"] + v
                        elif k == "tokens_total" and isinstance(v, int):
                            final_state["tokens_total"] = final_state.get("tokens_total", 0) + v
                        elif k == "worker_outputs" and isinstance(v, dict):
                            final_state.setdefault("worker_outputs", {})
                            final_state["worker_outputs"] = {**final_state["worker_outputs"], **v}
                        else:
                            final_state[k] = v

        log.info("[%s] astream complete after %d steps. final status=%s score=%.2f tokens=%d",
                 execution_id, step,
                 final_state.get("status", "?"),
                 final_state.get("critic_score", 0.0),
                 final_state.get("tokens_total", 0))

        await sb.upsert_execution(execution_id, {
            "status":       final_state.get("status", "completed"),
            "final_output": final_state.get("final_output", ""),
            "critic_score": final_state.get("critic_score", 0.0),
            "tokens_total": final_state.get("tokens_total", 0),
            "completed_at": _now(),
        })
        for trace in final_state.get("traces", []):
            try:
                await sb.append_node_trace(execution_id, trace)
            except Exception as te:
                log.warning("[%s] trace insert failed: %s", execution_id, te)
        try:
            await sb.save_checkpoint(execution_id, step, final_state)
        except Exception as ce:
            log.warning("[%s] checkpoint save failed: %s", execution_id, ce)

    except Exception as exc:
        log.exception("[%s] execution failed at step %d: %s", execution_id, step, exc)
        try:
            await sb.upsert_execution(execution_id, {
                "status":       "failed",
                "error":        str(exc)[:2000],
                "completed_at": _now(),
            })
        except Exception as dbe:
            log.error("[%s] failed to persist error status: %s", execution_id, dbe)
    finally:
        stop_hb.set()
        hb_task.cancel()
        try:
            await hb_task
        except asyncio.CancelledError:
            pass


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
    state: dict = {}
    try:
        log.info("[%s] sync workflow astream starting", execution_id)
        async for chunk in _graph().astream(
            _initial_state(execution_id, req.task_type, req.payload),
            config=cfg,
            stream_mode="updates",
        ):
            for node_name, node_update in chunk.items():
                log.info("[%s] sync step node=%s keys=%s", execution_id, node_name,
                         list(node_update.keys()) if isinstance(node_update, dict) else [])
                if isinstance(node_update, dict):
                    for k, v in node_update.items():
                        if k == "traces" and isinstance(v, list):
                            state.setdefault("traces", [])
                            state["traces"] = state["traces"] + v
                        elif k == "tokens_total" and isinstance(v, int):
                            state["tokens_total"] = state.get("tokens_total", 0) + v
                        elif k == "worker_outputs" and isinstance(v, dict):
                            state.setdefault("worker_outputs", {})
                            state["worker_outputs"] = {**state["worker_outputs"], **v}
                        else:
                            state[k] = v
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("[%s] sync workflow failed: %s", execution_id, exc)
        raise HTTPException(500, str(exc))

    log.info("[%s] sync workflow completed score=%.2f tokens=%d",
             execution_id, state.get("critic_score", 0.0), state.get("tokens_total", 0))
    await sb.upsert_execution(execution_id, {
        "status":       state.get("status", "completed"),
        "final_output": state.get("final_output", ""),
        "critic_score": state.get("critic_score", 0.0),
        "tokens_total": state.get("tokens_total", 0),
        "completed_at": _now(),
    })
    for trace in state.get("traces", []):
        await sb.append_node_trace(execution_id, trace)

    return RunResponse(
        execution_id = execution_id,
        status       = state.get("status", "completed"),
        final_output = state.get("final_output", ""),
        critic_score = state.get("critic_score", 0.0),
        tokens_total = state.get("tokens_total", 0),
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


@app.post("/test/node/{node_name}")
async def test_single_node(
    node_name: str,
    req: RunRequest,
    x_orchestrator_secret: str = Header(default=""),
):
    """Run a single named node in isolation to verify it resolves without hanging.
    Supported: planner, critic, memory_update, retry, worker_<agent>.
    """
    require_auth(x_orchestrator_secret)

    # Direct registry of callable async node functions (bypasses PregelNode wrapper)
    from nodes.planner import planner_node
    from nodes.critic import critic_node
    from nodes.memory_update import memory_update_node
    from nodes.retry import retry_node
    from nodes.workers import WORKER_NODES

    NODE_REGISTRY: dict = {
        "planner":       planner_node,
        "critic":        critic_node,
        "memory_update": memory_update_node,
        "retry":         retry_node,
        **{f"worker_{k}": v for k, v in WORKER_NODES.items()},
    }

    node_fn = NODE_REGISTRY.get(node_name)
    if node_fn is None:
        raise HTTPException(404, f"Node '{node_name}' not found. Available: {sorted(NODE_REGISTRY)}")

    execution_id = str(uuid.uuid4())
    initial = _initial_state(execution_id, req.task_type, req.payload)
    # Seed minimal state so downstream nodes have something to work with
    if node_name == "critic":
        initial["worker_outputs"] = {"research": "Sample research output for critic test."}
    if node_name == "memory_update":
        initial["worker_outputs"] = {"research": "Sample research output for memory test."}

    log.info("[%s] single-node test node=%s", execution_id, node_name)

    import time
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(node_fn(initial), timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, f"Node '{node_name}' timed out after 120s")
    except Exception as exc:
        log.exception("[%s] node test failed: %s", execution_id, exc)
        raise HTTPException(500, str(exc))

    latency = int((time.perf_counter() - t0) * 1000)
    log.info("[%s] single-node test completed node=%s latency=%dms", execution_id, node_name, latency)
    return {"node": node_name, "latency_ms": latency, "result_keys": list(result.keys()), "result": result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
