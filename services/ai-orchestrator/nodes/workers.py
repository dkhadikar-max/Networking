"""
Worker nodes — one per agent type.
Each reads the agent's system prompt from agents/*.md (loaded once at startup).
"""
import os
import time
from pathlib import Path
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, MODEL_WORKER
from state import GraphState

_client = Anthropic(api_key=ANTHROPIC_API_KEY)

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


async def _run_agent(agent: str, task: str, context: dict, previous_outputs: dict) -> dict:
    t0 = time.perf_counter()
    system = _load_prompt(agent)

    parts = [f"Task: {task}"]
    if previous_outputs:
        parts.append("Prior agent outputs:\n" + "\n\n".join(f"[{k}]\n{v}" for k, v in previous_outputs.items()))
    if context:
        import json
        parts.append(f"Context: {json.dumps(context, ensure_ascii=False)[:1500]}")

    response = _client.messages.create(
        model=MODEL_WORKER,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": "\n\n".join(parts)}],
    )

    latency = int((time.perf_counter() - t0) * 1000)
    output  = response.content[0].text

    return {
        "output": output,
        "tokens_in":  response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens,
        "latency_ms": latency,
    }


def _make_worker(agent_name: str):
    async def worker_node(state: GraphState) -> dict:
        # Find this agent's task from the plan
        task = next(
            (s["task"] for s in state.get("plan", []) if s["agent"] == agent_name),
            state["payload"].get("message", f"Execute as {agent_name} for: {state['task_type']}"),
        )
        result = await _run_agent(agent_name, task, state["payload"], state.get("worker_outputs", {}))

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
            "tokens_total": state.get("tokens_total", 0) + result["tokens_in"] + result["tokens_out"],
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
