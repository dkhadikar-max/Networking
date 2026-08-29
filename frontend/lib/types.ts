export type User = {
  id: string;
  name: string;
  email?: string;
  email_verified: boolean;
  // False only for an account created via magic-link signup that hasn't
  // set a real password yet (still on the random, unusable placeholder
  // hash) — absent/true for every other account. Gates the mandatory
  // /set-password redirect; see docs/passwordless-auth-2026-08-25.md.
  password_set?: boolean;
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
  // Returned by GET /api/profiles/:id only (viewer-relative enrichment) —
  // absent on /api/me (self) and on any other endpoint. Always check for
  // presence before rendering; never assume these exist.
  review_summary?: { count: number; avg_rating: number; top_tags: { tag: string; count: number }[] };
  mutual_count?: number;
  is_connected?: boolean;
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
  // Can be null if the other-party lookup fails server-side (missing/
  // deleted account, or a lookup error) — the UI must handle this
  // explicitly rather than assume `user` is always present.
  user: User | null;
  lastMessage?: { text: string; created_at: string; from: string };
  hoursLeft?: number | null;
  msgCount: number;
  unread_count?: number;
  active?: boolean;
  is_priority?: boolean;
  // Personalized ice-breaker chips, only emitted by GET /api/connections/:connId
  // (the detail endpoint) — absent on the /api/connections list response.
  // Deterministic server-side: same profile pair → same chip set. See
  // getIcebreakers() in server.js.
  icebreakers?: { label: string; text: string }[];
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
  type: 'circle_collaborate' | 'circle_like';
  actor_id: string | null;
  actor_name: string | null;
  actor_photo: string | null;
  ref_id: string | null;
  ref_type: string;
  ref_text: string | null;
  read: boolean;
  created_at: string;
};

export type CircleGroup = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  privacy: 'public' | 'private';
  creator_id: string;
  created_at: string;
  my_role: 'admin' | 'member' | null;
  member_count: number;
};

export type CircleGroupMember = {
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  user: {
    id: string;
    name: string;
    photos: string[];
    headline?: string;
    trust_score: number;
  } | null;
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
  like_count: number;
  liked_by_me: boolean;
  group_id: string | null;
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
