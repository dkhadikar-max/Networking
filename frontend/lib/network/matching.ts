interface Profile {
  interests?: string[];
  skills?: string[];
  intent?: string;
  location?: string;
}

export function sharedInterests(a: Profile, b: Profile): string[] {
  const aSet = new Set([...(a.interests ?? []), ...(a.skills ?? [])]);
  return [...(b.interests ?? []), ...(b.skills ?? [])].filter(t => aSet.has(t));
}

export function matchScore(me: Profile, other: Profile): number {
  let score = 0;
  score += sharedInterests(me, other).length * 10;
  if (me.intent && other.intent && me.intent === other.intent) score += 20;
  if (me.location && other.location && me.location === other.location) score += 15;
  return Math.min(score, 100);
}
