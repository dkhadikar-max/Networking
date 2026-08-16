# BYN Frontend Audit Agent

This directory contains the configuration, operating rules, test plan, route inventory, evidence area, report area, and UI/UX design agent for the BYN Frontend Audit System.

The audit system is intentionally separate from the BYN application source. The audit agents must remain read-only while auditing and must not modify application source code.

## Agents

### Frontend Auditor

`AGENT.md` — functional, runtime, responsive, accessibility, route, and release-readiness audit.

### UI/UX Designer

`UI-UX-DESIGNER.md` — evidence-driven UX, visual design, responsive design, accessibility, interaction design, design-system consistency, trust, and activation audit.

The UI/UX Designer should run after or alongside the functional audit, but it must use the actual discovered BYN routes and product behavior rather than generic design assumptions.

## Initial Antigravity Instruction

> Read `.byn-audit/AGENT.md` and `.byn-audit/PRODUCT.md`. Do not modify application source code. Inspect the BYN codebase and prepare the environment for a frontend audit. Determine the framework, package manager, development command, local URL, routes, authentication architecture, and major product flows. Do not perform the full audit yet. Report anything that must be resolved before the audit can begin.

## Full Frontend Audit Command

> Run the complete BYN frontend audit. Follow `.byn-audit/AGENT.md` exactly. Test the application through the browser as a real user. Do not modify application source code. Generate `.byn-audit/reports/BYN_FRONTEND_AUDIT.md`.

## UI/UX Audit Command

> Read `.byn-audit/UI-UX-DESIGNER.md`, `.byn-audit/PRODUCT.md`, `.byn-audit/ROUTES.md`, and `.byn-audit/reports/BYN_FRONTEND_AUDIT.md` if available. Run an evidence-driven UI/UX audit of the actual BYN frontend through browser inspection and source inspection. Do not modify application source code. Generate `.byn-audit/reports/BYN_UI_UX_AUDIT.md` and, when systemic design issues exist, `.byn-audit/audits/DESIGN_SYSTEM_RECOMMENDATIONS.md`.

## Recommended Order

1. Environment discovery
2. Functional frontend audit
3. UI/UX design audit
4. Consolidate P0/P1 findings
5. Create a prioritized remediation plan
6. Only then create a separate implementation/fixer agent

## Directory Layout

- `AGENT.md` — functional auditor operating specification
- `UI-UX-DESIGNER.md` — UI/UX design auditor and design-system specification
- `PRODUCT.md` — product scope and interpretation rules
- `TEST-PLAN.md` — ordered audit sequence
- `QUALITY-RULES.md` — non-negotiable audit rules
- `ROUTES.md` — route inventory maintained by the audit agent
- `audits/` — audit working artifacts
- `evidence/` — preserved evidence references/artifacts
- `reports/` — generated audit reports

## Read-Only Boundary

`.byn-audit/` may contain audit artifacts. The application source outside this directory must not be changed as part of an audit.