// `user.intent` is written from two different places with two different
// vocabularies: onboarding (server.js INTENT_LEGACY_MAP) writes one of the
// slugs below, while ProfileEdit's intent chips write a plain human label
// directly. Both need to render the same way.
const LEGACY_INTENT_LABELS: Record<string, string> = {
  'explore-network': 'Exploring network',
  'exchange-ideas': 'Exchanging ideas',
  'learn-mentorship': 'Learning / Mentorship',
  'build-relationships': 'Building relationships',
  'collaborate': 'Collaborate on projects',
  'find-cofounder': 'Finding a co-founder',
  'find-mentor': 'Finding a mentor',
  'hire': 'Hiring talent',
  'find-investors': 'Finding investors',
};

export function formatIntent(intent?: string | null): string {
  if (!intent) return '';
  return LEGACY_INTENT_LABELS[intent] ?? intent;
}
