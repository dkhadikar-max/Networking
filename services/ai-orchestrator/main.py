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
from fastapi import FastAPI, HTTPException, Header
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

# ── Task reference set — prevents asyncio.create_task from being GC'd ────────
_LIVE_TASKS: set = set()


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


def _task_done_callback(execution_id: str, task: asyncio.Task) -> None:
    """Logs every possible task exit: normal, exception, or cancellation."""
    if task.cancelled():
        log.error("[%s] TASK CANCELLED — coroutine was cancelled before completion", execution_id)
    elif task.exception():
        import traceback
        exc = task.exception()
        tb  = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        log.error("[%s] TASK EXCEPTION (unhandled): %s\n%s", execution_id, exc, tb)
    else:
        log.info("[%s] TASK DONE — exited normally", execution_id)


async def _execute_and_persist(execution_id: str, task_type: str, payload: dict):
    import traceback as tb_mod

    # ── STEP 0: coroutine entry ───────────────────────────────────────────────
    log.info("[%s] LIFECYCLE S0 coroutine entered task_type=%s loop=%s",
             execution_id, task_type, id(asyncio.get_event_loop()))

    sb = _sb()

    # ── STEP 1: write initial planning row ───────────────────────────────────
    log.info("[%s] LIFECYCLE S1 writing status=planning", execution_id)
    try:
        await sb.upsert_execution(execution_id, {
            "status":    "planning",
            "task_type": task_type,
            "payload":   payload,
        })
        log.info("[%s] LIFECYCLE S1 OK", execution_id)
    except BaseException as exc:
        log.error("[%s] LIFECYCLE S1 FAILED (%s): %s\n%s",
                  execution_id, type(exc).__name__, exc, tb_mod.format_exc())
        return

    # ── STEP 2: write running ─────────────────────────────────────────────────
    log.info("[%s] LIFECYCLE S2 writing status=running", execution_id)
    try:
        await sb.upsert_execution(execution_id, {"status": "running"})
        log.info("[%s] LIFECYCLE S2 OK", execution_id)
    except BaseException as exc:
        log.error("[%s] LIFECYCLE S2 FAILED (%s): %s\n%s",
                  execution_id, type(exc).__name__, exc, tb_mod.format_exc())
        # non-fatal — continue

    # ── STEP 3: build graph config ────────────────────────────────────────────
    log.info("[%s] LIFECYCLE S3 building graph config", execution_id)
    cfg        = {"configurable": {"thread_id": execution_id}}
    step       = 0
    final_state: dict = {}

    # ── STEP 4: call _graph().astream() ──────────────────────────────────────
    log.info("[%s] LIFECYCLE S4 calling _graph().astream() — about to enter async for", execution_id)
    try:
        astream_gen = _graph().astream(
            _initial_state(execution_id, task_type, payload),
            config=cfg,
        )
        log.info("[%s] LIFECYCLE S4 generator object created: %r", execution_id, astream_gen)

        # ── STEP 5: first iteration ───────────────────────────────────────────
        log.info("[%s] LIFECYCLE S5 awaiting first astream event", execution_id)
        async for state in astream_gen:
            step += 1
            traces    = state.get("traces", [])
            last_node = traces[-1]["node"] if traces else "?"
            cur_stat  = state.get("status", "running")
            log.info("[%s] LIFECYCLE S5+ SUPERSTEP %d last_node=%s status=%s tokens=%d traces=%d",
                     execution_id, step, last_node, cur_stat,
                     state.get("tokens_total", 0), len(traces))
            final_state = state
            try:
                await sb.upsert_execution(execution_id, {"status": cur_stat})
            except BaseException as se:
                log.warning("[%s] intermediate DB write failed (%s): %s",
                            execution_id, type(se).__name__, se)

        # ── STEP 6: stream exhausted ──────────────────────────────────────────
        log.info("[%s] LIFECYCLE S6 astream exhausted after %d supersteps status=%s score=%.2f tokens=%d",
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
            except BaseException as te:
                log.warning("[%s] trace insert failed: %s", execution_id, te)
        try:
            await sb.save_checkpoint(execution_id, step, final_state)
        except BaseException as ce:
            log.warning("[%s] checkpoint save failed: %s", execution_id, ce)

    except asyncio.CancelledError:
        # CancelledError is BaseException — must be caught explicitly
        log.error("[%s] LIFECYCLE CANCELLED at superstep %d — task was cancelled by event loop",
                  execution_id, step)
        raise  # re-raise so asyncio marks the task cancelled

    except BaseException as exc:
        log.error("[%s] LIFECYCLE EXCEPTION at superstep %d (%s): %s\n%s",
                  execution_id, step, type(exc).__name__, exc, tb_mod.format_exc())
        try:
            await sb.upsert_execution(execution_id, {
                "status":       "failed",
                "error":        str(exc)[:2000],
                "completed_at": _now(),
            })
        except BaseException as dbe:
            log.error("[%s] failed to persist error status: %s", execution_id, dbe)

    log.info("[%s] LIFECYCLE END coroutine returning", execution_id)


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
    cfg   = {"configurable": {"thread_id": execution_id}}
    state: dict = {}
    try:
        log.info("[%s] sync workflow astream starting (values mode)", execution_id)
        async for state in _graph().astream(
            _initial_state(execution_id, req.task_type, req.payload),
            config=cfg,
        ):
            traces    = state.get("traces", [])
            last_node = traces[-1]["node"] if traces else "?"
            log.info("[%s] sync superstep last_node=%s status=%s tokens=%d",
                     execution_id, last_node, state.get("status", "?"), state.get("tokens_total", 0))
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
    x_orchestrator_secret: str = Header(default=""),
):
    """Async workflow — returns immediately, runs graph as asyncio task."""
    require_auth(x_orchestrator_secret)
    if req.task_type not in ALLOWED_TASK_TYPES:
        raise HTTPException(400, f"task_type must be one of {sorted(ALLOWED_TASK_TYPES)}")

    _graph()  # fail fast if not ready
    execution_id = str(uuid.uuid4())
    log.info("[%s] async workflow queued task_type=%s", execution_id, req.task_type)

    # asyncio.create_task guarantees scheduling in the running event loop.
    # We keep a reference in _LIVE_TASKS to prevent GC before the task completes.
    task = asyncio.create_task(
        _execute_and_persist(execution_id, req.task_type, req.payload),
        name=f"exec-{execution_id}",
    )
    _LIVE_TASKS.add(task)
    task.add_done_callback(lambda t: _task_done_callback(execution_id, t))
    task.add_done_callback(_LIVE_TASKS.discard)
    log.info("[%s] task created name=%s tasks_in_flight=%d", execution_id, task.get_name(), len(_LIVE_TASKS))

    return {"execution_id": execution_id, "status": "queued"}


# Legacy aliases so admin.html keeps working without changes
@app.post("/run", response_model=RunResponse)
async def run_sync_alias(req: RunRequest, x_orchestrator_secret: str = Header(default="")):
    return await run_workflow(req, x_orchestrator_secret)

@app.post("/run/async")
async def run_async_alias(req: RunRequest, x_orchestrator_secret: str = Header(default="")):
    return await run_workflow_async(req, x_orchestrator_secret)


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
