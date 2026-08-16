# BYN Product Definition

## Product

BYN is an intent-based professional networking platform. The product is designed around helping people discover and connect with relevant people based on what they are looking for, rather than treating connection count as the primary measure of networking quality.

## Core Areas

1. Authentication
2. Onboarding
3. Discovery
4. Likes
5. Matches
6. Community
7. Profile

Discovery, Likes, and Matches are high-priority product flows and must receive deeper functional and responsive testing than secondary areas.

## Cross-Platform Requirement

The product must be usable across mobile and desktop breakpoints. The audit must explicitly test 320, 375, 390, 430, 768, 1024, and 1440px widths.

## Audit Interpretation Rules

The auditor must distinguish among:

- **Functional bugs:** behavior does not meet the implemented/product flow expectation.
- **UX issues:** interaction, information architecture, feedback, discoverability, or task-completion problem.
- **Visual issues:** measurable layout, spacing, typography, alignment, rendering, or consistency defect.
- **Accessibility issues:** keyboard, focus, semantics, contrast, target size, labels, or other accessibility deficiency.
- **Technical issues:** runtime, performance, dependency, configuration, integration, or implementation concern.
- **Subjective design opinions:** aesthetic or preference-based recommendations that are not themselves confirmed defects.

Do not convert an opinion into a bug. Do not assume a feature exists merely because it is common in another networking product. Audit what BYN actually implements.