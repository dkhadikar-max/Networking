"""
Critic node — evaluates combined worker outputs.
Produces a confidence score (0.0-1.0) and actionable feedback.
Low-confidence outputs are routed back for retry.
"""
import json
import time
from anthropic import AsyncAnthropic
from config import ANTHROPIC_API_KEY, MODEL_CRITIC, CRITIC_THRESHOLD
from state import GraphState

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
    outputs   = state.get("worker_outputs", {})
    task_type = state["task_type"]
    payload   = state["payload"]

    combined = "\n\n".join(f"[{k}]\n{v}" for k, v in outputs.items())
    user_msg = (
        f"Original task: {task_type}\n"
        f"Payload: {json.dumps(payload, ensure_ascii=False)[:500]}\n\n"
        f"Agent outputs:\n{combined[:4000]}\n\n"
        f"Score threshold: {CRITIC_THRESHOLD}"
    )

    response = await _client.messages.create(
        model=MODEL_CRITIC,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    latency = int((time.perf_counter() - t0) * 1000)
    raw = response.content[0].text.strip()
    if "```" in raw:
        raw = raw.split("```")[1].lstrip("json").strip()

    result = json.loads(raw)
    score    = float(result["score"])
    feedback = result.get("feedback", "")
    passed   = score >= CRITIC_THRESHOLD

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
        "tokens_total": state.get("tokens_total", 0) + response.usage.input_tokens + response.usage.output_tokens,
    }
