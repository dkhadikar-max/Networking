# BYN Frontend Audit Agent

This folder contains the reusable BYN frontend audit system for Antigravity.

## Files

- `AGENT.md` — operating instructions for the auditor
- `PRODUCT.md` — BYN product behavior and priorities
- `TEST-PLAN.md` — structured audit sequence
- `QUALITY-RULES.md` — audit quality and safety rules
- `ROUTES.md` — generated route inventory
- `audits/` — optional intermediate audit artifacts
- `evidence/` — screenshots/evidence
- `reports/` — final reports

## First Antigravity instruction

Read `.byn-audit/AGENT.md` and `.byn-audit/PRODUCT.md`.

Do not modify application source code.

Inspect the BYN codebase and prepare the environment for a frontend audit.

Determine the framework, package manager, development command, local URL, routes, authentication architecture, and major product flows.

Do not perform the full audit yet.

Report anything that must be resolved before the audit can begin.

## Full audit instruction

Run the complete BYN frontend audit.

Follow `.byn-audit/AGENT.md` exactly.

Test the application through the browser as a real user.

Do not modify application source code.

Generate:
`.byn-audit/reports/BYN_FRONTEND_AUDIT.md`
