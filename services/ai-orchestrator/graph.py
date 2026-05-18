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

import logging

from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from state import GraphState
from config import CRITIC_THRESHOLD, MAX_RETRIES
from nodes.planner import planner_node
from nodes.workers import WORKER_NODES
from nodes.critic import critic_node
from nodes.retry import retry_node
from nodes.memory_update import memory_update_node

log = logging.getLogger("orchestrator.graph")


# ── Router: dispatches to the correct worker nodes based on the plan ──

async def router_node(state: GraphState) -> dict:
    """No-op router — routing is handled by the conditional edges below."""
    exec_id = state.get("execution_id", "?")
    groups  = state.get("parallel_groups", [])
    log.info("[%s] router_node: parallel_groups=%s plan_agents=%s",
             exec_id, groups, [s["agent"] for s in state.get("plan", [])])
    return {}


def _route_from_router(state: GraphState) -> list[str]:
    """After router, fan out to all agents in the FIRST parallel group."""
    exec_id = state.get("execution_id", "?")
    groups  = state.get("parallel_groups", [])
    if not groups:
        log.info("[%s] _route_from_router: no groups — routing direct to critic", exec_id)
        return ["critic"]
    first_group = groups[0]
    targets = [f"worker_{a}" for a in first_group if a in WORKER_NODES]
    skipped = [a for a in first_group if a not in WORKER_NODES]
    log.info("[%s] _route_from_router: first_group=%s → targets=%s skipped=%s",
             exec_id, first_group, targets, skipped)
    if not targets:
        log.warning("[%s] _route_from_router: first_group has no valid workers — routing to critic", exec_id)
        return ["critic"]
    return targets


def _route_from_critic(state: GraphState) -> str:
    exec_id  = state.get("execution_id", "?")
    score    = state.get("critic_score", 0.0)
    retries  = state.get("retry_count", 0)
    decision = "retry" if score < CRITIC_THRESHOLD and retries < MAX_RETRIES else "memory_update"
    log.info("[%s] _route_from_critic: score=%.2f threshold=%.2f retries=%d → %s",
             exec_id, score, CRITIC_THRESHOLD, retries, decision)
    return decision


def _route_from_retry(state: GraphState) -> list[str]:
    """After retry, re-run all workers in the plan."""
    exec_id = state.get("execution_id", "?")
    plan    = state.get("plan", [])
    agents  = [s["agent"] for s in plan if s["agent"] in WORKER_NODES]
    targets = [f"worker_{a}" for a in agents] if agents else ["critic"]
    log.info("[%s] _route_from_retry: plan_agents=%s → targets=%s", exec_id, agents, targets)
    return targets


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

    compiled = g.compile(checkpointer=MemorySaver())

    # Log compiled graph structure for cycle/topology verification
    nodes = list(compiled.nodes.keys()) if hasattr(compiled, "nodes") else ["<unavailable>"]
    log.info("Graph compiled. Nodes: %s", nodes)
    log.info("Graph topology: START→planner→router→workers(fan-out)→critic→(retry|memory_update)→END")
    log.info("Conditional routing: critic→retry if score<%.2f and retries<%d, else→memory_update",
             CRITIC_THRESHOLD, MAX_RETRIES)
    log.info("Worker set: %s", sorted(WORKER_NODES.keys()))

    return compiled


