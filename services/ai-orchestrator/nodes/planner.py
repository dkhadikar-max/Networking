"""
Planner node — analyzes the task and produces an ordered execution plan.
Decides which agents to invoke and which can run in parallel.
"""
import asyncio
import json
import logging
import time
from anthropic import AsyncAnthropic
from config import ANTHROPIC_API_KEY, MODEL_PLANNER
from state import GraphState

log = logging.getLogger("orchestrator.planner")
NODE_TIMEOUT = 60  # seconds per Claude API call

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """You are a task planner for an AI operating system. Given a task type and payload,
output a JSON execution plan specifying which agents to invoke.

Available agents: ceo, backend, frontend, growth, security, qa, research, devops

Rules:
- Only include agents relevant to the task
- Use parallel_group (integer) to indicate which agents can run concurrently (same number = parallel)
- Sequential steps must have different parallel_group values
- Be minimal: 2-4 agents per workflow, not all 8

Output format (strict JSON array):
[
  {"agent": "research", "task": "<specific task for this agent>", "parallel_group": 1},
  {"agent": "growth",   "task": "<specific task>",                "parallel_group": 2},
  {"agent": "qa",       "task": "<specific review task>",         "parallel_group": 3}
]"""

WORKFLOW_HINTS = {
    "seo_audit":        "Research SEO gaps, then growth strategy, then QA the recommendations.",
    "growth_strategy":  "Research market, generate growth strategy in parallel with competitor analysis, QA the plan.",
    "research":         "Research agent does deep analysis, CEO prioritizes findings.",
    "qa_review":        "QA agent reviews, security checks for risks, backend validates feasibility.",
}


async def planner_node(state: GraphState) -> dict:
    t0 = time.perf_counter()
    exec_id   = state.get("execution_id", "?")
    task_type = state["task_type"]
    payload   = state["payload"]
    hint      = WORKFLOW_HINTS.get(task_type, "Create a sensible multi-agent execution plan.")

    log.info("[%s] planner ENTER task_type=%s model=%s", exec_id, task_type, MODEL_PLANNER)

    user_msg = f"""Task type: {task_type}
Hint: {hint}
Payload: {json.dumps(payload, ensure_ascii=False)[:2000]}

Produce the JSON execution plan."""

    try:
        response = await asyncio.wait_for(
            _client.messages.create(
                model=MODEL_PLANNER,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            ),
            timeout=NODE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.error("[%s] planner TIMEOUT after %ds", exec_id, NODE_TIMEOUT)
        raise RuntimeError(f"planner timed out after {NODE_TIMEOUT}s")

    latency = int((time.perf_counter() - t0) * 1000)
    log.info("[%s] planner Claude response in %dms tokens_in=%d tokens_out=%d",
             exec_id, latency, response.usage.input_tokens, response.usage.output_tokens)

    raw = response.content[0].text.strip()

    # Extract JSON array (robust to markdown fences)
    if "```" in raw:
        raw = raw.split("```")[1].lstrip("json").strip()

    try:
        plan: list[dict] = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("[%s] planner JSON parse failed: %s | raw=%r", exec_id, e, raw[:200])
        raise

    # Group by parallel_group for the router
    groups: dict[int, list[str]] = {}
    for step in plan:
        g = step.get("parallel_group", 1)
        groups.setdefault(g, []).append(step["agent"])
    parallel_groups = [groups[k] for k in sorted(groups)]

    log.info("[%s] planner EXIT plan=%s parallel_groups=%s", exec_id, [s["agent"] for s in plan], parallel_groups)

    trace = {
        "node": "planner",
        "status": "completed",
        "tokens_in": response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens,
        "latency_ms": latency,
        "output_preview": json.dumps(plan)[:300],
        "error": None,
    }

    return {
        "plan": plan,
        "parallel_groups": parallel_groups,
        "status": "running",
        "traces": [trace],
        "tokens_total": response.usage.input_tokens + response.usage.output_tokens,
    }
