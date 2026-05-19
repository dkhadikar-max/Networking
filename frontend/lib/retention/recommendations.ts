import { RetentionSignal, SignalType } from './signals';

export interface Recommendation {
  id: string;
  type: SignalType;
  icon: string;
  title: string;
  description: string;
  cta: string;
  priority: 'high' | 'medium' | 'low';
  href?: string;
}

const TEMPLATES: Record<SignalType, Omit<Recommendation, 'id' | 'type' | 'priority'>> = {
  add_photo: {
    icon: '📸',
    title: 'Add your first photo',
    description: 'Profiles with photos get 3× more connections. Unlock discovery now.',
    cta: 'Add photo',
    href: 'https://buildyournetwork.online/webapp.html#profile',
  },
  pending_likes: {
    icon: '💌',
    title: 'People have liked your profile',
    description: "Someone's waiting. See who's interested in connecting with you.",
    cta: 'View likes',
    href: 'https://buildyournetwork.online/webapp.html#likes',
  },
  complete_profile: {
    icon: '✅',
    title: 'Complete your profile',
    description: 'A complete profile gets you into discovery and better matches.',
    cta: 'Complete now',
    href: '/onboarding',
  },
  missing_bio: {
    icon: '✍️',
    title: 'Add a bio',
    description: "Tell people what you're building. A bio boosts match quality immediately.",
    cta: 'Write bio',
    href: 'https://buildyournetwork.online/webapp.html#profile',
  },
  add_interests: {
    icon: '🏷️',
    title: 'Add 3+ interests',
    description: 'Interests power your matches. More tags = better relevance.',
    cta: 'Add interests',
    href: 'https://buildyournetwork.online/webapp.html#profile',
  },
  stale_connection: {
    icon: '💬',
    title: 'Reconnect with someone',
    description: "A connection hasn't heard from you in a while. A quick message goes a long way.",
    cta: 'Send message',
    href: 'https://buildyournetwork.online/webapp.html#connections',
  },
  no_connections: {
    icon: '🤝',
    title: 'Make your first connection',
    description: 'Start discovering people who share your goals. Swipe to connect.',
    cta: 'Start discovering',
    href: 'https://buildyournetwork.online/webapp.html#discover',
  },
  resume_discovery: {
    icon: '🔍',
    title: "Today's people are waiting",
    description: 'New profiles added daily. Pick up where you left off.',
    cta: 'Discover now',
    href: 'https://buildyournetwork.online/webapp.html#discover',
  },
};

export function buildRecommendations(signals: RetentionSignal[]): Recommendation[] {
  const seen = new Set<SignalType>();
  const recs: Recommendation[] = [];

  for (const signal of signals) {
    if (signal.type === 'stale_connection') {
      const meta = signal.metadata as { connId: string; name: string; daysSince: number } | undefined;
      if (!meta) continue;
      recs.push({
        id: `stale-${meta.connId}`,
        type: signal.type,
        priority: signal.priority,
        icon: '💬',
        title: `Message ${meta.name}`,
        description: `You haven't spoken in ${meta.daysSince} days. A quick note keeps the relationship warm.`,
        cta: 'Send message',
        href: 'https://buildyournetwork.online/webapp.html#connections',
      });
      continue;
    }

    if (signal.type === 'pending_likes') {
      const meta = signal.metadata as { count: number } | undefined;
      const tmpl = TEMPLATES[signal.type];
      recs.push({
        id: signal.type,
        type: signal.type,
        priority: signal.priority,
        ...tmpl,
        title: `${meta?.count ?? ''} ${meta?.count === 1 ? 'person has' : 'people have'} liked your profile`,
      });
      seen.add(signal.type);
      continue;
    }

    if (!seen.has(signal.type)) {
      seen.add(signal.type);
      recs.push({ id: signal.type, type: signal.type, priority: signal.priority, ...TEMPLATES[signal.type] });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}
