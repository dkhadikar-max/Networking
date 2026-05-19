"""
Worker nodes — one per agent type.
Each reads the agent's system prompt from agents/*.md (loaded once at startup).
"""
import asyncio
import logging
import os
import time
from pathlib import Path
from anthropic import AsyncAnthropic
from config import ANTHROPIC_API_KEY, MODEL_WORKER
from state import GraphState

log = logging.getLogger("orchestrator.workers")
NODE_TIMEOUT = 180  # raised from 120s — 8192 max_tokens needs ~150s generation time

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

# Resolve agents/*.md: look in service's own agents/ first, then walk up to repo root.
# The service bundles agents/ at services/ai-orchestrator/agents/ for Railway deployments
# where only the service subdirectory is copied. Falls back gracefully if neither exists.
def _find_agents_dir() -> Path:
    # Primary: agents/ copied alongside this service (works in all Railway configs)
    svc_root = Path(__file__).parent.parent
    bundled = svc_root / "agents"
    if bundled.is_dir():
        return bundled
    # Fallback: walk up to find agents/ in a parent (works when running from repo root)
    for parent in svc_root.parents:
        candidate = parent / "agents"
        if candidate.is_dir():
            return candidate
    return bundled  # non-existent; _load_prompt handles missing files gracefully

_AGENTS_DIR = _find_agents_dir()

_SYSTEM_PROMPTS: dict[str, str] = {}


def _load_prompt(agent: str) -> str:
    if agent not in _SYSTEM_PROMPTS:
        md = _AGENTS_DIR / f"{agent}.md"
        _SYSTEM_PROMPTS[agent] = md.read_text(encoding="utf-8").strip() if md.exists() else f"You are the {agent} agent. Be precise."
    return _SYSTEM_PROMPTS[agent]


async def _run_agent(agent: str, task: str, context: dict, previous_outputs: dict, exec_id: str = "?") -> dict:
    import json
    t0 = time.perf_counter()
    system = _load_prompt(agent)

    parts = [f"Task: {task}"]
    if previous_outputs:
        parts.append("Prior agent outputs:\n" + "\n\n".join(f"[{k}]\n{v}" for k, v in previous_outputs.items()))
    if context:
        parts.append(f"Context: {json.dumps(context, ensure_ascii=False)[:1500]}")

    log.info("[%s] worker_%s ENTER model=%s", exec_id, agent, MODEL_WORKER)
    try:
        response = await asyncio.wait_for(
            _client.messages.create(
                model=MODEL_WORKER,
                max_tokens=8192,
                system=system,
                messages=[{"role": "user", "content": "\n\n".join(parts)}],
            ),
            timeout=NODE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.error("[%s] worker_%s TIMEOUT after %ds", exec_id, agent, NODE_TIMEOUT)
        raise RuntimeError(f"worker_{agent} timed out after {NODE_TIMEOUT}s")

    latency = int((time.perf_counter() - t0) * 1000)
    output  = response.content[0].text
    log.info("[%s] worker_%s EXIT latency=%dms tokens_in=%d tokens_out=%d",
             exec_id, agent, latency, response.usage.input_tokens, response.usage.output_tokens)

    return {
        "output": output,
        "tokens_in":  response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens,
        "latency_ms": latency,
    }


def _make_worker(agent_name: str):
    async def worker_node(state: GraphState) -> dict:
        exec_id = state.get("execution_id", "?")
        # Find this agent's task from the plan
        task = next(
            (s["task"] for s in state.get("plan", []) if s["agent"] == agent_name),
            state["payload"].get("message", f"Execute as {agent_name} for: {state['task_type']}"),
        )
        try:
            result = await _run_agent(agent_name, task, state["payload"], state.get("worker_outputs", {}), exec_id)
            trace = {
                "node": f"worker_{agent_name}",
                "status": "completed",
                "tokens_in":  result["tokens_in"],
                "tokens_out": result["tokens_out"],
                "latency_ms": result["latency_ms"],
                "output_preview": result["output"][:300],
                "error": None,
            }
            return {
                "worker_outputs": {agent_name: result["output"]},
                "traces": [trace],
                "tokens_total": result["tokens_in"] + result["tokens_out"],
            }
        except Exception as exc:
            log.exception("[%s] worker_%s FAILED: %s", exec_id, agent_name, exc)
            trace = {
                "node": f"worker_{agent_name}",
                "status": "failed",
                "tokens_in": 0, "tokens_out": 0, "latency_ms": 0,
                "output_preview": str(exc)[:300],
                "error": str(exc),
            }
            return {
                "worker_outputs": {agent_name: f"[ERROR] {exc}"},
                "traces": [trace],
                "tokens_total": 0,
            }

    worker_node.__name__ = f"{agent_name}_node"
    return worker_node


# Instantiate a node function for each agent
ceo_node      = _make_worker("ceo")
backend_node  = _make_worker("backend")
frontend_node = _make_worker("frontend")
growth_node   = _make_worker("growth")
security_node = _make_worker("security")
qa_node       = _make_worker("qa")
research_node = _make_worker("research")
devops_node   = _make_worker("devops")

WORKER_NODES: dict[str, object] = {
    "ceo":      ceo_node,
    "backend":  backend_node,
    "frontend": frontend_node,
    "growth":   growth_node,
    "security": security_node,
    "qa":       qa_node,
    "research": research_node,
    "devops":   devops_node,
}
