"""
Memory update node — extracts key insights from the final output and persists
them to the agent_memory Supabase table for future agent context enrichment.
"""
import asyncio
import json
import logging
import time
from anthropic import AsyncAnthropic
from config import ANTHROPIC_API_KEY, MODEL_WORKER
from state import GraphState
from supabase_client import get_supabase

log = logging.getLogger("orchestrator.memory_update")
NODE_TIMEOUT = 60

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

EXTRACT_PROMPT = """Extract 1-3 durable insights from this agent execution that future agents should remember.
Output strict JSON array (empty array if nothing worth persisting):
[
  {"key": "short_snake_case_key", "value": "insight text", "category": "insight|decision|fact|preference", "confidence": 0.0-1.0, "agent": "which_agent_learned_this"}
]
Only include high-signal, generalizable facts. Skip task-specific details."""


async def memory_update_node(state: GraphState) -> dict:
    t0      = time.perf_counter()
    exec_id = state.get("execution_id", "?")
    outputs = state.get("worker_outputs", {})
    combined = "\n\n".join(f"[{k}]\n{v}" for k, v in outputs.items())[:3000]

    log.info("[%s] memory_update ENTER worker_count=%d", exec_id, len(outputs))

    try:
        response = await asyncio.wait_for(
            _client.messages.create(
                model=MODEL_WORKER,
                max_tokens=512,
                system=EXTRACT_PROMPT,
                messages=[{"role": "user", "content": combined}],
            ),
            timeout=NODE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.error("[%s] memory_update TIMEOUT after %ds — skipping memory extraction", exec_id, NODE_TIMEOUT)
        response = None

    latency = int((time.perf_counter() - t0) * 1000)
    tokens_in = tokens_out = 0
    insights: list[dict] = []

    if response is not None:
        raw = response.content[0].text.strip()
        if "```" in raw:
            raw = raw.split("```")[1].lstrip("json").strip()
        try:
            insights = json.loads(raw) if raw.startswith("[") else []
        except json.JSONDecodeError:
            log.warning("[%s] memory_update JSON parse failed — no insights saved", exec_id)
        tokens_in  = response.usage.input_tokens
        tokens_out = response.usage.output_tokens

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
        except Exception as e:
            log.warning("[%s] memory_update insert failed: %s", exec_id, e)

    # Build combined final output from all workers
    final = "\n\n".join(f"## {k.title()} Agent\n{v}" for k, v in outputs.items())

    log.info("[%s] memory_update EXIT saved=%d insights latency=%dms", exec_id, saved, latency)

    trace = {
        "node": "memory_update",
        "status": "completed",
        "tokens_in":  tokens_in,
        "tokens_out": tokens_out,
        "latency_ms": latency,
        "output_preview": f"saved {saved} memory entries",
        "error": None,
    }

    return {
        "final_output": final,
        "status": "completed",
        "traces": [trace],
        "tokens_total": tokens_in + tokens_out,
    }
