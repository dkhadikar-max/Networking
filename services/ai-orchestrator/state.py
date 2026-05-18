"""
Shared graph state — passed between every node in the LangGraph execution.
"""
from __future__ import annotations
from typing import Annotated, Any, Literal
from typing_extensions import TypedDict
import operator


class NodeTrace(TypedDict):
    node: str
    status: Literal["started", "completed", "failed", "skipped"]
    tokens_in: int
    tokens_out: int
    latency_ms: int
    output_preview: str   # first 300 chars of output
    error: str | None


class GraphState(TypedDict):
    # ── identity
    execution_id: str
    task_type: str           # seo_audit | growth_strategy | research | qa_review
    payload: dict[str, Any]

    # ── planner output
    plan: list[dict]         # [{agent, task, parallel_group}]
    parallel_groups: list[list[str]]   # which agents run concurrently per step

    # ── worker outputs  (accumulated — use operator.add to merge across parallel nodes)
    worker_outputs: Annotated[dict[str, str], lambda a, b: {**a, **b}]

    # ── critic
    critic_score: float          # 0.0 – 1.0
    critic_feedback: str
    retry_count: int

    # ── final
    final_output: str
    status: Literal["queued", "planning", "running", "blocked", "retrying", "failed", "completed"]

    # ── observability  (accumulated across nodes)
    traces: Annotated[list[NodeTrace], operator.add]
    tokens_total: int
