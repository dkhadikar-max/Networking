# BYN Audit Quality Rules

- Do not modify application source code during an audit.
- Do not fabricate test results.
- Do not claim a feature works without testing it.
- Do not misclassify backend failures as frontend failures.
- Separate bugs from design opinions.
- Prioritize user impact.
- Test mobile explicitly.
- Test core journeys before cosmetic details.
- Prefer reproducible findings.
- State when something cannot be tested.
- Preserve evidence where available.
- Never copy secrets into audit files.
- Prefer local/test data over production data.
- Finish with a prioritized remediation plan.

Additional operating rule: do not silently fill gaps in evidence. If a cause cannot be isolated, classify it as Unknown and explain what evidence would be required to isolate it.