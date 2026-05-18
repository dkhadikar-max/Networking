"""
Retry node — increments retry counter and injects critic feedback into the payload
so workers run again with specific improvement instructions.
"""
from state import GraphState


async def retry_node(state: GraphState) -> dict:
    feedback = state.get("critic_feedback", "")
    payload  = dict(state.get("payload", {}))
    payload["_retry_feedback"] = feedback
    payload["_retry_count"]    = state.get("retry_count", 0) + 1

    trace = {
        "node": "retry",
        "status": "completed",
        "tokens_in": 0,
        "tokens_out": 0,
        "latency_ms": 0,
        "output_preview": f"retry #{payload['_retry_count']} — feedback injected",
        "error": None,
    }

    return {
        "payload":     payload,
        "retry_count": payload["_retry_count"],
        "worker_outputs": {},      # clear previous outputs so workers re-run fresh
        "status":      "retrying",
        "traces":      [trace],
    }
