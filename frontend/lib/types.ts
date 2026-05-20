export type User = {
  id: string;
  name: string;
  email?: string;
  email_verified: boolean;
  onboarding_stage: string;
  photos: string[];
  bio?: string;
  location?: string;
  intent?: string;
  interests?: string[];
  skills?: string[];
  current_role?: string;
  role?: string;
  headline?: string;
  profile_score: number;
  trust_score: number;
  is_profile_complete: boolean;
  linkedin?: string;
  website?: string;
  instagram?: string;
  working_on?: string;
  currently_exploring?: string;
  verified?: boolean;
  is_online?: boolean;
  is_recently_active?: boolean;
  last_active?: string;
  is_premium?: boolean;
  premium?: boolean;
};

export type DiscoverProfile = {
  user?: User;
  // flat shape returned by /api/discover when not nested
  id?: string;
  name?: string;
  photos?: string[];
  match_score?: number;
  matchScore?: number;
  connection?: { id: string };
};

export type Connection = {
  connection: { id: string; user1: string; user2: string };
  user: User;
  lastMessage?: { text: string; created_at: string; from: string };
  hoursLeft?: number | null;
  msgCount: number;
  unread_count?: number;
  active?: boolean;
  is_priority?: boolean;
};

export type Message = {
  id: string;
  text: string;
  from: string;
  created_at: string;
  connection_id: string;
};

export type LikedMeResponse = {
  premium_required?: boolean;
  count?: number;
  previews?: Partial<User>[];
  profiles?: (User & { matchScore?: number })[];
};
