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
  trust_score?: number;
  insight?: string;
  matchReasons?: string[];
  distance?: number | null;
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

export type PriorityMessage = {
  id: string;
  from: string;
  to: string;
  text: string;
  month: string;
  read: boolean;
  created_at: string;
  sender?: Partial<User>;
};

export type PriorityMessagesResponse = {
  received: PriorityMessage[];
  sent: PriorityMessage[];
  remaining: number;
  limit: number;
};

export const CIRCLE_TAGS = [
  'Building','Learning','Solving','Seeking','Progress',
  'Launching','Hiring','Fundraising','Collab','Open Source',
] as const;
export type CircleTag = typeof CIRCLE_TAGS[number];

export type LinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  domain: string;
};

export type CircleNotification = {
  id: string;
  user_id: string;
  type: 'circle_collaborate';
  actor_id: string | null;
  actor_name: string | null;
  actor_photo: string | null;
  ref_id: string | null;
  ref_type: string;
  ref_text: string | null;
  read: boolean;
  created_at: string;
};

export type CirclePost = {
  id: string;
  user_id: string;
  text: string;
  tags: CircleTag[];
  structured_meta: {
    looking_for?: string;
    building?: string;
    current_goal?: string;
    open_to?: string;
    industry?: string;
    skill_level?: string;
    location?: string;
    timeline?: string;
  };
  links: LinkPreview[];
  created_at: string;
  author: {
    id: string;
    name: string;
    photos: string[];
    intent?: string;
    trust_score: number;
    verification?: { status: string; confidence: number };
    last_active?: string;
    headline?: string;
  } | null; // author is a LEFT JOIN server-side — can be null if the account was deleted
};
