import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY",            "")
SUPABASE_URL       = os.getenv("SUPABASE_URL",                  "")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_ROLE_KEY",     "")
MODEL_PLANNER      = os.getenv("MODEL_PLANNER",  "claude-opus-4-7")
MODEL_WORKER       = os.getenv("MODEL_WORKER",   "claude-sonnet-4-6")
MODEL_CRITIC       = os.getenv("MODEL_CRITIC",   "claude-sonnet-4-6")
CRITIC_THRESHOLD   = float(os.getenv("CRITIC_THRESHOLD", "0.75"))
MAX_RETRIES        = int(os.getenv("MAX_RETRIES", "2"))
PORT               = int(os.getenv("PORT", "8000"))

REQUIRED = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
