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
    title: 'Complete your builder card with a photo',
    description: 'Profiles with clear photos receive 4.2× higher match response rates in Discovery.',
    cta: 'Add Photo',
    href: '/profile',
  },
  pending_likes: {
    icon: '🎯',
    title: 'Builders want to connect with you',
    description: 'High-relevance founders and engineers reviewed your profile. Check mutual intents and connect.',
    cta: 'Review Builders',
    href: '/likes',
  },
  complete_profile: {
    icon: '🚀',
    title: 'Unlock verified builder discovery',
    description: 'A completed profile boosts your relevance score and unlocks high-signal founder matching.',
    cta: 'Complete Profile',
    href: '/onboarding',
  },
  missing_bio: {
    icon: '✍️',
    title: 'Highlight what you are building',
    description: 'Share your startup mission or technical stack. A focused bio elevates connection quality immediately.',
    cta: 'Update Bio',
    href: '/profile',
  },
  add_interests: {
    icon: '🏷️',
    title: 'Tag 3+ domain interests & skills',
    description: 'Specific technical tags (e.g. AI/ML, React, WebGL) optimize your automated match algorithm.',
    cta: 'Add Tags',
    href: '/profile',
  },
  stale_connection: {
    icon: '💬',
    title: 'Keep collaboration momentum alive',
    description: 'A connection hasn’t heard from you this week. Drop a quick 1-click icebreaker to reconnect.',
    cta: 'Send Message',
    href: '/chat',
  },
  no_connections: {
    icon: '🤝',
    title: 'Discover your next co-founder or collaborator',
    description: 'Start exploring active builders who match your specific intent and technical background.',
    cta: 'Start Discovering',
    href: '/discover',
  },
  resume_discovery: {
    icon: '⚡',
    title: 'Fresh builder profiles waiting today',
    description: 'New verified founders and operators joined your network. Pick up discovery where you left off.',
    cta: 'Explore Builders',
    href: '/discover',
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
        title: `Reconnect with ${meta.name}`,
        description: `You haven't spoken in ${meta.daysSince} days. Drop a quick note to keep project momentum active.`,
        cta: 'Send Quick Note',
        href: `/chat/${meta.connId}`,
      });
      continue;
    }

    if (signal.type === 'pending_likes') {
      const meta = signal.metadata as { count: number } | undefined;
      const tmpl = TEMPLATES[signal.type];
      const count = meta?.count ?? 1;
      recs.push({
        id: signal.type,
        type: signal.type,
        priority: signal.priority,
        ...tmpl,
        title: `🎯 ${count} ${count === 1 ? 'Builder wants' : 'Builders want'} to connect with you`,
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
