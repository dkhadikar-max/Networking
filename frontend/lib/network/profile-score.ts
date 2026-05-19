interface UserProfile {
  name?: string;
  bio?: string;
  headline?: string;
  profession?: string;
  photos?: string[];
  skills?: string[];
  interests?: string[];
  location?: string;
  linkedin?: string;
  instagram?: string;
  working_on?: string;
}

interface ScoreBreakdown {
  total: number;
  fields: Record<string, number>;
}

export function calcProfileScore(user: UserProfile): ScoreBreakdown {
  const fields: Record<string, number> = {
    name:       user.name              ? 10 : 0,
    photo:      (user.photos?.length ?? 0) > 0 ? 25 : 0,
    bio:        (user.bio?.length ?? 0) >= 10   ? 20 : 0,
    headline:   user.headline          ? 10 : 0,
    profession: user.profession        ? 10 : 0,
    skills:     (user.skills?.length ?? 0) > 0  ? 10 : 0,
    interests:  (user.interests?.length ?? 0) > 0 ? 5 : 0,
    location:   user.location          ? 5  : 0,
    social:     (user.linkedin || user.instagram) ? 5 : 0,
  };
  const total = Object.values(fields).reduce((a, b) => a + b, 0);
  return { total, fields };
}

export function profileScoreLabel(score: number): string {
  if (score >= 80) return 'Complete';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Getting there';
  return 'Just started';
}
