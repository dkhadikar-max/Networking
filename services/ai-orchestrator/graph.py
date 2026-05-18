"""
LangGraph execution graph — BYN AI Operating System.

Topology:
  START → planner → router → [workers in parallel per group] → critic
                                      ↑                            |
                                    retry ←──── (score < threshold & retries left)
                                                                   |
                                                       (pass or max retries)
                                                                   ↓
                                                           memory_update → END
"""
from __future__ import annotations

from langgraph.graph import StateGraph, END, START

from state import GraphState
from config import CRITIC_THRESHOLD, MAX_RETRIES
from nodes.planner import planner_node
from nodes.workers import WORKER_NODES
from nodes.critic import critic_node
from nodes.retry import retry_node
from nodes.memory_update import memory_update_node


# ── Router: dispatches to the correct worker nodes based on the plan ──

async def router_node(state: GraphState) -> dict:
    """No-op router — routing is handled by the conditional edges below."""
    return {}


def _route_from_router(state: GraphState) -> list[str]:
    """After router, fan out to all agents in the FIRST parallel group."""
    groups = state.get("parallel_groups", [])
    if not groups:
        return ["critic"]
    first_group = groups[0]
    return [f"worker_{a}" for a in first_group if a in WORKER_NODES]


def _route_from_critic(state: GraphState) -> str:
    score    = state.get("critic_score", 0.0)
    retries  = state.get("retry_count", 0)
    if score < CRITIC_THRESHOLD and retries < MAX_RETRIES:
        return "retry"
    return "memory_update"


def _route_from_retry(state: GraphState) -> list[str]:
    """After retry, re-run all workers in the plan."""
    plan = state.get("plan", [])
    agents = [s["agent"] for s in plan if s["agent"] in WORKER_NODES]
    return [f"worker_{a}" for a in agents] if agents else ["critic"]


def build_graph():
    g = StateGraph(GraphState)

    # ── Register nodes ──
    g.add_node("planner",      planner_node)
    g.add_node("router",       router_node)
    g.add_node("critic",       critic_node)
    g.add_node("retry",        retry_node)
    g.add_node("memory_update",memory_update_node)

    for agent_name, worker_fn in WORKER_NODES.items():
        g.add_node(f"worker_{agent_name}", worker_fn)

    # ── Edges ──
    g.add_edge(START, "planner")
    g.add_edge("planner", "router")

    # Fan-out from router → parallel workers
    g.add_conditional_edges(
        "router",
        _route_from_router,
        {f"worker_{a}": f"worker_{a}" for a in WORKER_NODES} | {"critic": "critic"},
    )

    # All workers converge on critic
    for agent_name in WORKER_NODES:
        g.add_edge(f"worker_{agent_name}", "critic")

    # Critic → retry or memory_update
    g.add_conditional_edges("critic", _route_from_critic, {
        "retry":         "retry",
        "memory_update": "memory_update",
    })

    # Retry → fan-out to workers again
    g.add_conditional_edges(
        "retry",
        _route_from_retry,
        {f"worker_{a}": f"worker_{a}" for a in WORKER_NODES} | {"critic": "critic"},
    )

    g.add_edge("memory_update", END)

    return g.compile()


# Module-level singleton — compiled once, reused for all executions
GRAPH = build_graph()
