# BYN Frontend Audit + UI/UX Build System

This directory contains the configuration, operating rules, test plan, route inventory, evidence area, report area, UI/UX design agent, and UI/UX build + visual generation agent for the BYN Frontend Audit System.

The audit system is intentionally separate from the BYN application source. Audit agents remain read-only while auditing. The UI/UX Build Agent may modify application source only after explicit implementation authorization.

## Agents

### Frontend Auditor

`AGENT.md` — functional, runtime, responsive, accessibility, route, and release-readiness audit.

### UI/UX Designer

`UI-UX-DESIGNER.md` — evidence-driven UX, visual design, responsive design, accessibility, interaction design, design-system consistency, trust, and activation audit.

### UI/UX Build + Visual Generation Agent

`UI-UX-BUILD-AGENT.md` — converts approved UX direction into implementation-ready design systems, visual prototypes, generated visual-asset briefs/assets, and frontend implementation plans. It may implement approved changes only when explicitly authorized.

## Initial Antigravity Instruction

> Read `.byn-audit/AGENT.md` and `.byn-audit/PRODUCT.md`. Do not modify application source code. Inspect the BYN codebase and prepare the environment for a frontend audit. Determine the framework, package manager, development command, local URL, routes, authentication architecture, and major product flows. Do not perform the full audit yet. Report anything that must be resolved before the audit can begin.

## Full Frontend Audit Command

> Run the complete BYN frontend audit. Follow `.byn-audit/AGENT.md` exactly. Test the application through the browser as a real user. Do not modify application source code. Generate `.byn-audit/reports/BYN_FRONTEND_AUDIT.md`.

## UI/UX Audit Command

> Read `.byn-audit/UI-UX-DESIGNER.md`, `.byn-audit/PRODUCT.md`, `.byn-audit/ROUTES.md`, and `.byn-audit/reports/BYN_FRONTEND_AUDIT.md` if available. Run an evidence-driven UI/UX audit of the actual BYN frontend through browser inspection and source inspection. Do not modify application source code. Generate `.byn-audit/reports/BYN_UI_UX_AUDIT.md` and, when systemic design issues exist, `.byn-audit/audits/DESIGN_SYSTEM_RECOMMENDATIONS.md`.

## UI/UX Build Command

> Read `.byn-audit/UI-UX-BUILD-AGENT.md`, `.byn-audit/UI-UX-DESIGNER.md`, `.byn-audit/PRODUCT.md`, `.byn-audit/reports/BYN_FRONTEND_AUDIT.md`, and `.byn-audit/reports/BYN_UI_UX_AUDIT.md` if available. Inspect the actual BYN frontend. Create an evidence-driven UI/UX build plan and design system. Identify where generated visual assets materially improve the experience and create generation briefs/assets when supported. Do not modify application source code unless explicitly authorized. Generate `.byn-audit/audits/UI_UX_BUILD_PLAN.md` and `.byn-audit/audits/DESIGN_SYSTEM.md`.

## UI/UX Implementation Command

> Implement the approved BYN UI/UX build plan. Read `.byn-audit/UI-UX-BUILD-AGENT.md` and all relevant audit reports first. Modify application source only within the approved scope. Reuse existing components and design tokens where possible. Use generated visual assets only where approved. Run browser regression tests at the required responsive widths. Record all changes in `.byn-audit/audits/UI_UX_IMPLEMENTATION_LOG.md`. Do not modify unrelated functionality.

## Recommended Order

1. Environment discovery
2. Functional frontend audit
3. UI/UX design audit
4. Consolidate P0/P1 findings
5. Create UI/UX build plan + design system
6. Generate/approve required visual assets
7. Explicitly authorize implementation
8. Implement UI/UX changes
9. Browser regression audit
10. Re-run functional + UI/UX audits

## Directory Layout

- `AGENT.md` — functional auditor operating specification
- `UI-UX-DESIGNER.md` — UI/UX design auditor and design-system specification
- `UI-UX-BUILD-AGENT.md` — UI/UX implementation planning and visual-generation specification
- `PRODUCT.md` — product scope and interpretation rules
- `TEST-PLAN.md` — ordered audit sequence
- `QUALITY-RULES.md` — non-negotiable audit rules
- `ROUTES.md` — route inventory maintained by the audit agent
- `audits/` — audit working artifacts
- `evidence/` — preserved evidence references/artifacts
- `reports/` — generated audit reports

## Read-Only Boundary

`.byn-audit/` may contain audit artifacts. The application source outside this directory must not be changed during an audit. The UI/UX Build Agent may modify application source only after the user explicitly authorizes implementation.
