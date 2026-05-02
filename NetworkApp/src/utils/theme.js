// ── Design Tokens — Peach + Teal Premium System ───────────────────────────────

export const C = {
  // ── Backgrounds ──────────────────────────────────────
  bg:           '#FFF4EC',   // primary background (warm peach)
  bgSec:        '#FDE8D7',   // secondary background
  card:         '#FFFFFF',   // card surface

  // ── Primary — teal (ALL actions, selection, CTA) ─────
  primary:      '#0F766E',
  primarySoft:  '#14B8A6',
  primaryLight: '#CCFBF1',

  // ── Accent — orange (highlights only, max 10%) ────────
  accent:       '#F4A261',
  accentLight:  'rgba(244,162,97,0.12)',

  // ── Borders ───────────────────────────────────────────
  border:       'rgba(0,0,0,0.05)',
  border2:      'rgba(0,0,0,0.10)',

  // ── Text ──────────────────────────────────────────────
  text:         '#1F2937',
  sub:          '#6B7280',
  dim:          '#9CA3AF',

  // ── Status ────────────────────────────────────────────
  danger:       '#EF4444',
  green:        '#14B8A6',   // teal dot (not green — spec: never mix)

  // ── Legacy aliases ────────────────────────────────────
  sur:          '#FFFFFF',
  sur2:         '#FDE8D7',
  sur3:         '#FFF4EC',
  gold:         '#F4A261',
  goldBg:       'rgba(244,162,97,0.12)',
  goldMid:      'rgba(244,162,97,0.25)',
};

export const SPACE = { xs:4, sm:8, md:16, lg:24, xl:32 };

export const RADIUS = { card:16, button:14, chip:20 };

export const SHADOW = {
  shadowColor:   '#000',
  shadowOffset:  { width:0, height:4 },
  shadowOpacity: 0.08,
  shadowRadius:  12,
  elevation:     4,
};

export const fonts = { serif:'serif', sans:'System' };
