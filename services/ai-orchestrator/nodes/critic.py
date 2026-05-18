"""
Critic node — evaluates combined worker outputs.
Produces a confidence score (0.0-1.0) and actionable feedback.
Low-confidence outputs are routed back for retry.
"""
import asyncio
import json
import logging
import time
from anthropic import AsyncAnthropic
from config import ANTHROPIC_API_KEY, MODEL_CRITIC, CRITIC_THRESHOLD
from state import GraphState

log = logging.getLogger("orchestrator.critic")
NODE_TIMEOUT = 60

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """You are a quality critic for an AI operating system.
Evaluate the combined output of multiple AI agents against the original task.

Score on these dimensions (each 0.0-1.0):
- completeness: does the output fully address the task?
- accuracy:     is the content factually grounded and internally consistent?
- actionability: are the outputs specific and actionable (not generic filler)?
- coherence:    do the agent outputs form a unified, non-contradictory whole?

Output strict JSON:
{
  "score": <float 0.0-1.0 — weighted average>,
  "dimensions": {"completeness": 0.0, "accuracy": 0.0, "actionability": 0.0, "coherence": 0.0},
  "feedback": "<1-3 specific improvement instructions for the retry>",
  "pass": <true if score >= threshold else false>
}"""


async def critic_node(state: GraphState) -> dict:
    t0 = time.perf_counter()
    exec_id   = state.get("execution_id", "?")
    outputs   = state.get("worker_outputs", {})
    task_type = state["task_type"]
    payload   = state["payload"]

    log.info("[%s] critic ENTER worker_count=%d model=%s", exec_id, len(outputs), MODEL_CRITIC)

    combined = "\n\n".join(f"[{k}]\n{v}" for k, v in outputs.items())
    user_msg = (
        f"Original task: {task_type}\n"
        f"Payload: {json.dumps(payload, ensure_ascii=False)[:500]}\n\n"
        f"Agent outputs:\n{combined[:4000]}\n\n"
        f"Score threshold: {CRITIC_THRESHOLD}"
    )

    try:
        response = await asyncio.wait_for(
            _client.messages.create(
                model=MODEL_CRITIC,
                max_tokens=512,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            ),
            timeout=NODE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.error("[%s] critic TIMEOUT after %ds", exec_id, NODE_TIMEOUT)
        raise RuntimeError(f"critic timed out after {NODE_TIMEOUT}s")

    latency = int((time.perf_counter() - t0) * 1000)
    raw = response.content[0].text.strip()
    if "```" in raw:
        raw = raw.split("```")[1].lstrip("json").strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("[%s] critic JSON parse failed: %s | raw=%r", exec_id, e, raw[:200])
        result = {"score": 0.5, "feedback": "Parse error — defaulting score"}

    score    = float(result.get("score", 0.5))
    feedback = result.get("feedback", "")
    passed   = score >= CRITIC_THRESHOLD

    log.info("[%s] critic EXIT score=%.2f pass=%s latency=%dms", exec_id, score, passed, latency)

    trace = {
        "node": "critic",
        "status": "completed",
        "tokens_in":  response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens,
        "latency_ms": latency,
        "output_preview": f"score={score:.2f} pass={passed} | {feedback[:200]}",
        "error": None,
    }

    return {
        "critic_score":    score,
        "critic_feedback": feedback,
        "traces": [trace],
        "tokens_total": response.usage.input_tokens + response.usage.output_tokens,
    }
