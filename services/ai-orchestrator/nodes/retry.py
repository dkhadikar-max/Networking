"""
Retry node — increments retry counter and injects critic feedback into the payload
so workers run again with specific improvement instructions.
"""
import logging
from state import GraphState

log = logging.getLogger("orchestrator.retry")


async def retry_node(state: GraphState) -> dict:
    exec_id  = state.get("execution_id", "?")
    feedback = state.get("critic_feedback", "")
    payload  = dict(state.get("payload", {}))
    payload["_retry_feedback"] = feedback
    new_count = state.get("retry_count", 0) + 1
    payload["_retry_count"] = new_count

    log.info("[%s] retry ENTER retry_count=%d score=%.2f feedback=%r",
             exec_id, new_count, state.get("critic_score", 0.0), feedback[:100])

    trace = {
        "node": "retry",
        "status": "completed",
        "tokens_in": 0,
        "tokens_out": 0,
        "latency_ms": 0,
        "output_preview": f"retry #{new_count} — feedback injected",
        "error": None,
    }

    # Note: worker_outputs reducer is lambda a,b:{**a,**b} so {} won't clear existing outputs.
    # Workers will see prior outputs in context which helps them improve on retry — intentional.
    return {
        "payload":     payload,
        "retry_count": new_count,
        "status":      "retrying",
        "traces":      [trace],
    }
