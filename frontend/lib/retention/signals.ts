export type SignalType =
  | 'add_photo'
  | 'complete_profile'
  | 'pending_likes'
  | 'stale_connection'
  | 'no_connections'
  | 'missing_bio'
  | 'add_interests'
  | 'resume_discovery';

export interface RetentionSignal {
  type: SignalType;
  priority: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
}

export interface ProfileStatus {
  profile_score: number;
  is_profile_complete: boolean;
  checklist: { photos: boolean; interests: boolean; intent: boolean; bio: boolean; name: boolean };
}

export interface Connection {
  connection: { id: string; expires_at: string; active: boolean };
  user: { id: string; name: string; headline: string | null; photos: string[]; interests: string[] };
  lastMessage: { created_at: string; content: string } | null;
  msgCount: number;
  hoursLeft: number | null;
}

export interface UserProfile {
  id: string;
  name: string;
  profile_score: number;
  photos: string[];
  interests: string[];
  bio: string | null;
  last_active: string;
}

const STALE_DAYS = 7;

export function computeSignals(
  profile: UserProfile,
  profileStatus: ProfileStatus,
  connections: Connection[],
  likedMeCount: number,
): RetentionSignal[] {
  const signals: RetentionSignal[] = [];

  if (!profileStatus.checklist.photos) {
    signals.push({ type: 'add_photo', priority: 'high' });
  }

  if (likedMeCount > 0) {
    signals.push({ type: 'pending_likes', priority: 'high', metadata: { count: likedMeCount } });
  }

  if (!profileStatus.is_profile_complete) {
    signals.push({ type: 'complete_profile', priority: 'high', metadata: { score: profile.profile_score } });
  }

  if (!profileStatus.checklist.bio) {
    signals.push({ type: 'missing_bio', priority: 'medium' });
  }

  if (!profileStatus.checklist.interests) {
    signals.push({ type: 'add_interests', priority: 'medium' });
  }

  if (connections.length === 0) {
    signals.push({ type: 'no_connections', priority: 'medium' });
  }

  const now = Date.now();
  for (const c of connections) {
    const lastAt = c.lastMessage
      ? new Date(c.lastMessage.created_at).getTime()
      : new Date(c.connection.expires_at).getTime() - 7 * 86400000;
    const daysSince = (now - lastAt) / 86400000;
    if (daysSince >= STALE_DAYS) {
      signals.push({
        type: 'stale_connection',
        priority: 'medium',
        metadata: { connId: c.connection.id, name: c.user.name, daysSince: Math.floor(daysSince) },
      });
    }
  }

  const lastActive = new Date(profile.last_active).getTime();
  if ((now - lastActive) / 3600000 > 23) {
    signals.push({ type: 'resume_discovery', priority: 'low' });
  }

  return signals;
}

export function networkMomentumScore(
  profile: UserProfile,
  connections: Connection[],
  profileStatus: ProfileStatus,
): number {
  let score = 0;
  score += Math.min(connections.length * 12, 40);
  const activeMsgs = connections.filter(c => c.msgCount > 0).length;
  score += Math.min(activeMsgs * 10, 30);
  score += Math.round((profileStatus.profile_score / 100) * 30);
  return Math.min(score, 100);
}
