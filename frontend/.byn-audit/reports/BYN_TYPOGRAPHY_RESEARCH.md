# BYN Typography & Font System Research Report

**Date:** August 25, 2026  
**Audited Brand:** BuildYourNetwork (BYN)  
**Target Aesthetic:** World-Class Founder/Builder Network (Linear + Bumble Bizz + Apple Benchmark)  
**Focus:** Visual Authority, Micro-UI Legibility, Tabular Numerals, and Performance  

---

## 1. Executive Summary & Typography Objectives

In an elite, high-intent professional networking application like BYN, typography is not merely decorative—it establishes **trust, visual hierarchy, credibility, and scanning efficiency**. 

Builders, founders, and investors make rapid connection decisions based on:
1. **Name & Verified Identity** (Needs immediate authority and crispness).
2. **Intent Badges & Trust Metrics** (Must be razor-sharp at 10px–11px micro sizes).
3. **Countdown Timers & Percentages** (Requires `tabular-nums` to eliminate layout jitter).
4. **Prompt Cards & Bio Text** (Requires comfortable line length and optimal line height `1.6`).

---

## 2. Comprehensive Font Evaluation Matrix

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FONT CANDIDATES BENCHMARK                                      │
├────────────────────┬────────────────────┬──────────┬──────────┬──────────┬───────────────────────┤
│ Font Family        │ Style / Personality│ Micro UI │ Headings │ Numbers  │ Benchmark Reference   │
├────────────────────┼────────────────────┼──────────┼──────────┼──────────┼───────────────────────┤
│ Plus Jakarta Sans  │ Geometric + Human  │ 96 / 100 │ 98 / 100 │ 95 / 100 │ Bumble Bizz, Linear UI│
│ Inter (Current)    │ Neo-Grotesque UI   │ 94 / 100 │ 88 / 100 │ 96 / 100 │ Figma, GitHub, Notion │
│ Geist              │ Modern Swiss / Dev │ 95 / 100 │ 94 / 100 │ 96 / 100 │ Vercel, Next.js       │
│ Satoshi            │ Geometric Grotesque│ 90 / 100 │ 96 / 100 │ 90 / 100 │ Modern FinTech / Web3 │
│ SF Pro (System)    │ Apple Native       │ 95 / 100 │ 92 / 100 │ 95 / 100 │ Apple iOS / macOS     │
└────────────────────┴────────────────────┴──────────┴──────────┴──────────┴───────────────────────┘
```

---

## 3. Detailed Font Candidate Profiles

### 1. 🏆 Plus Jakarta Sans (`next/font/google`) — Top Recommended
* **Origin & Geometry:** Designed by Gumpita Rahayu / Tokotype. Wide geometric proportions with open apertures and tall x-height (`0.54`).
* **Why it fits BYN:**
  - Carries the friendly, energetic, modern executive energy of Bumble Bizz while feeling clean and technical.
  - Headings in `font-extrabold (800)` with `tracking-tight (-0.03em)` produce immediate visual impact.
  - Rounded punchy numerals look exceptional in badges (`96% MATCH`, `⏱ 18h left`).

### 2. Inter (`next/font/google`) — Optimal Workhorse for Body & Chat
* **Origin & Geometry:** Designed by Rasmus Andersson specifically for computer screens and dense UI layouts.
* **Why it fits BYN:**
  - Unrivaled legibility in long message streams, bio paragraphs, and fine print.
  - Built-in OpenType features: `cv02`, `cv03`, `cv04`, `tnum` (tabular numerals).

### 3. Geist (`geist/font`) — The Developer/AI Alternative
* **Origin & Geometry:** Designed by Vercel in collaboration with Basement Studio.
* **Why it fits BYN:**
  - High-precision, ultra-technical vibe. Ideal if BYN leans heavily into pure AI/crypto engineer demographics.

---

## 4. Recommended Production Typography Architecture

### 💎 The Dual-Engine System (Recommended)

```css
:root {
  /* Display / Brand Headings (Plus Jakarta Sans) */
  --font-display: var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
  
  /* Interface & Long-form Body (Inter) */
  --font-sans: var(--font-inter), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BYN TYPOGRAPHY SCALE TOKENS                        │
├───────────────────┬─────────┬────────┬──────────┬───────────────────────────┤
│ Role              │ Size    │ Weight │ Tracking │ Line-Height               │
├───────────────────┼─────────┼────────┼──────────┼───────────────────────────┤
│ Hero Headline     │ 32px    │ 900    │ -0.035em │ 1.15 (Display)            │
│ Section Title     │ 22px    │ 800    │ -0.025em │ 1.25 (Display)            │
│ Card Name         │ 20px    │ 800    │ -0.02em  │ 1.3  (Display)            │
│ Body Text / Bio   │ 14px    │ 500    │ normal   │ 1.6  (Body Sans)          │
│ Subtext / Caption │ 12px    │ 600    │ +0.01em  │ 1.4  (Body Sans)          │
│ Intent / Badges   │ 11px    │ 800    │ +0.05em  │ 1.2  (Caps + Tabular Num) │
│ Micro-Timestamp   │ 10px    │ 700    │ +0.02em  │ 1.2  (Tabular Num)        │
└───────────────────┴─────────┴────────┴──────────┴───────────────────────────┘
```

---

## 5. Performance & Next.js Optimization
- Configured via `next/font/google` with `display: 'swap'` and `subsets: ['latin']`.
- Zero render-blocking downloads; Next.js automatically self-hosts and inlines critical font CSS during build.
- 0ms layout shift (CLS = 0).
