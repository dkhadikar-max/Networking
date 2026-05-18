"""
Supabase client — shared singleton, used by nodes and checkpoint saver.
"""
from __future__ import annotations
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


async def upsert_execution(execution_id: str, data: dict) -> None:
    sb = get_supabase()
    sb.table("langgraph_executions").upsert({
        "id": execution_id,
        **data,
        "updated_at": "now()",
    }).execute()


async def append_node_trace(execution_id: str, trace: dict) -> None:
    sb = get_supabase()
    sb.table("langgraph_node_traces").insert({
        "execution_id": execution_id,
        **trace,
    }).execute()


async def save_checkpoint(execution_id: str, step: int, state: dict) -> None:
    sb = get_supabase()
    sb.table("langgraph_checkpoints").upsert({
        "execution_id": execution_id,
        "step": step,
        "state": state,
        "saved_at": "now()",
    }, on_conflict="execution_id,step").execute()


async def load_latest_checkpoint(execution_id: str) -> dict | None:
    sb = get_supabase()
    result = (
        sb.table("langgraph_checkpoints")
        .select("*")
        .eq("execution_id", execution_id)
        .order("step", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["state"]
    return None
