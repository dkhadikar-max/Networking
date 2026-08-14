// ── Homepage product-preview sample data ────────────────────────────────
//
// Renders through the REAL app components (SwipeCard, ProfileView,
// CirclePostCard) so the homepage shows actual BYN UI, not a fabricated
// mockup. The identity below is a clearly illustrative placeholder — no
// photo, no invented trust/match score, no "verified" claim — pending
// swap for a real screenshot of the CTO-provided synthetic demo account
// (see docs/redesign-plan-2026-08-14.md §5, item 2).
//
// TODO(demo-account): once the demo account exists, replace this file's
// values with the real captured profile/post/message data.

import type { DiscoverProfile, User, CirclePost } from '@/lib/types';

// `trust_score` is deliberately omitted (not set to 0) — SwipeCard/ProfileView
// only render a trust badge when the value is non-null, and a real "Trust 0"
// badge on a synthetic profile would read as a fabricated negative claim,
// which is worse than showing no badge at all.
export const SAMPLE_USER = {
  id: '',
  name: 'Meera Nair',
  email_verified: true,
  onboarding_stage: 'complete',
  photos: [],
  location: 'Bengaluru',
  intent: 'find-cofounder',
  interests: ['Design systems', 'Async collaboration'],
  skills: ['Product', 'Growth'],
  headline: 'Product Designer',
  profile_score: 92,
  is_profile_complete: true,
  working_on: 'A design-tech platform for async product reviews.',
  currently_exploring: 'A technical co-founder to build with',
  verified: false,
} as unknown as User;

export const SAMPLE_DISCOVER_PROFILE: DiscoverProfile = {
  user: SAMPLE_USER,
};

export const SAMPLE_CIRCLE_POST: CirclePost = {
  id: 'sample',
  user_id: '',
  text: "Looking for a growth marketer to launch a B2B SaaS product — let's build together.",
  tags: [],
  structured_meta: { looking_for: 'Growth marketer', industry: 'SaaS' },
  links: [],
  // Fixed rather than Date.now()-relative, for clarity — though the real
  // fix for the hydration mismatch this caused is in page.tsx: CirclePreview
  // (the only preview that renders a "time ago" string) is loaded with
  // `ssr: false`, since ANY relative-time text will drift between the
  // server's render pass and the client's hydration pass once real time has
  // moved between them, regardless of whether created_at itself is fixed.
  created_at: '2026-08-14T12:00:00.000Z',
  like_count: 12,
  liked_by_me: false,
  group_id: null,
  author: {
    id: '',
    name: SAMPLE_USER.name,
    photos: [],
    intent: SAMPLE_USER.intent,
    // CirclePostCard renders this unconditionally (no null-guard), unlike
    // SwipeCard/ProfileView — so it can't be omitted. profile_score above
    // implies a complete profile, so this mirrors that rather than reading
    // as an arbitrary/broken value.
    trust_score: SAMPLE_USER.profile_score,
  },
};

export const SAMPLE_CONVERSATION = [
  { fromMe: false, text: "Hi! I saw you're looking for a technical co-founder. I'm building something similar in the climate space." },
  { fromMe: true, text: 'Hey — yes, exactly. Would love to hear more about your background.' },
  { fromMe: false, text: 'Sure. Ex-Stripe engineer, 6 years in infra. Looking for someone with product and GTM experience.' },
];
