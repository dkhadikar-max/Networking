# BYN Frontend Audit Agent

This directory contains the configuration, operating rules, test plan, route inventory, evidence area, and report area for the BYN Frontend Audit Agent.

The audit system is intentionally separate from the BYN application source. The agent must remain read-only while auditing and must not modify application source code.

## Initial Antigravity Instruction

> Read .byn-audit/AGENT.md and .byn-audit/PRODUCT.md. Do not modify application source code. Inspect the BYN codebase and prepare the environment for a frontend audit. Determine the framework, package manager, development command, local URL, routes, authentication architecture, and major product flows. Do not perform the full audit yet. Report anything that must be resolved before the audit can begin.

## Full Audit Command

> Run the complete BYN frontend audit. Follow .byn-audit/AGENT.md exactly. Test the application through the browser as a real user. Do not modify application source code. Generate .byn-audit/reports/BYN_FRONTEND_AUDIT.md.

## Directory Layout

- `AGENT.md` — auditor operating specification
- `PRODUCT.md` — product scope and interpretation rules
- `TEST-PLAN.md` — ordered audit sequence
- `QUALITY-RULES.md` — non-negotiable audit rules
- `ROUTES.md` — route inventory maintained by the audit agent
- `audits/` — audit working artifacts
- `evidence/` — preserved evidence references/artifacts
- `reports/` — generated audit reports

## Read-Only Boundary

`.byn-audit/` may contain audit artifacts. The application source outside this directory must not be changed as part of an audit.