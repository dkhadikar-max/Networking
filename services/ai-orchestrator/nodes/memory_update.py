"""
Memory update node — extracts key insights from the final output and persists
them to the agent_memory Supabase table for future agent context enrichment.
"""
import json
import time
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, MODEL_WORKER
from state import GraphState
from supabase_client import get_supabase

_client = Anthropic(api_key=ANTHROPIC_API_KEY)

EXTRACT_PROMPT = """Extract 1-3 durable insights from this agent execution that future agents should remember.
Output strict JSON array (empty array if nothing worth persisting):
[
  {"key": "short_snake_case_key", "value": "insight text", "category": "insight|decision|fact|preference", "confidence": 0.0-1.0, "agent": "which_agent_learned_this"}
]
Only include high-signal, generalizable facts. Skip task-specific details."""


async def memory_update_node(state: GraphState) -> dict:
    t0      = time.perf_counter()
    outputs = state.get("worker_outputs", {})
    combined = "\n\n".join(f"[{k}]\n{v}" for k, v in outputs.items())[:3000]

    response = _client.messages.create(
        model=MODEL_WORKER,
        max_tokens=512,
        system=EXTRACT_PROMPT,
        messages=[{"role": "user", "content": combined}],
    )

    latency = int((time.perf_counter() - t0) * 1000)
    raw = response.content[0].text.strip()
    if "```" in raw:
        raw = raw.split("```")[1].lstrip("json").strip()

    insights: list[dict] = json.loads(raw) if raw.startswith("[") else []

    sb = get_supabase()
    saved = 0
    for ins in insights:
        try:
            sb.table("agent_memory").upsert({
                "agent":      ins.get("agent", "system"),
                "key":        ins["key"],
                "value":      {"value": ins["value"], "source": state["execution_id"]},
                "category":   ins.get("category", "insight"),
                "confidence": ins.get("confidence", 0.8),
            }, on_conflict="agent,key").execute()
            saved += 1
        except Exception:
            pass

    # Build combined final output from all workers
    final = "\n\n".join(f"## {k.title()} Agent\n{v}" for k, v in outputs.items())

    trace = {
        "node": "memory_update",
        "status": "completed",
        "tokens_in":  response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens,
        "latency_ms": latency,
        "output_preview": f"saved {saved} memory entries",
        "error": None,
    }

    return {
        "final_output": final,
        "status": "completed",
        "traces": [trace],
        "tokens_total": state.get("tokens_total", 0) + response.usage.input_tokens + response.usage.output_tokens,
    }
