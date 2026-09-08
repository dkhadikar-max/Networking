# JARVIS V1

Personal agentic AI control plane built on the existing Networking/BYN agent foundation.

## Foundation reused

- `agents/orchestrator.js` — existing task queue + agent dispatcher
- `agents/base.js` — existing Claude-backed agent runtime
- `agents/memory.js` — existing memory implementation
- `agents/scheduler.js` — existing scheduling capability
- Existing agent prompts: CEO, backend, frontend, growth, security, QA, PM, research, DevOps
- `NetworkApp/` — existing Expo mobile application foundation

## Open-source integrations planned for V1

- OpenClaw: device/channel assistant shell
- Qwen3/Qwen-Agent: optional open-weight model provider
- Browser Use: browser execution tool
- OpenHands: coding execution tool

These are adapters, not replacements for the existing agent system.

## V1 capabilities

1. Text command intake
2. Intent routing
3. Agent delegation
4. Persistent task records
5. Personal memory hooks
6. Permission gates for consequential actions
7. Browser/coding adapter interfaces
8. Mobile-ready API contract
9. Single JARVIS identity across clients
10. Audit trail for every execution

## Safety model

Read/analyze actions may run automatically. External messages, production deployment, destructive changes, and spending require approval.

## Environment

```env
JARVIS_MODEL=claude-sonnet-4-6
JARVIS_OPENAI_BASE_URL=
JARVIS_OPENAI_API_KEY=
JARVIS_OPENCLAW_URL=
JARVIS_BROWSER_USE_URL=
JARVIS_OPENHANDS_URL=
JARVIS_AUTO_EXECUTE=false
```

Never commit secrets.
