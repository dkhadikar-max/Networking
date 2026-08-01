// Custom line-icon set for onboarding — matches the outline style used
// elsewhere in the app (stroke=currentColor, 24x24, round caps/joins).
// Replaces generic emoji so onboarding feels like a designed product, not a survey.

type IconProps = { size?: number };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconNetwork = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="12" cy="18" r="3" /><line x1="8.5" y1="7.5" x2="10" y2="15.5" /><line x1="15.5" y1="7.5" x2="14" y2="15.5" /></svg>
);
export const IconCompass = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>
);
export const IconRocket = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 19 3a12.88 12.88 0 0 1-2.06 8A22 22 0 0 1 13 13l-1 2z" /><path d="M9 12H4s.55-2.23 2-3c1.62-.87 4 0 4 0" /><path d="M12 15v5s2.23-.55 3-2c.87-1.62 0-4 0-4" /></svg>
);
export const IconTeam = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const IconBriefcase = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);
export const IconTarget = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
);
export const IconGraduate = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" /></svg>
);
export const IconBook = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
export const IconGlobe = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
);
export const IconTrendUp = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
);

// ── "How did you hear about us" sources ──
export const IconLinkedIn = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="9" width="4" height="11" /><circle cx="5" cy="4.5" r="1.8" /><path d="M11 9v11" /><path d="M11 13.5c0-2.5 2-4.5 4.5-4.5S20 11 20 13.5V20h-4v-6a1.5 1.5 0 0 0-3 0v6h-2v-6.5z" /></svg>
);
export const IconInstagram = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
);
export const IconX = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
);
export const IconWhatsApp = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l1-4.5A8.5 8.5 0 1 1 21 11.5z" /><path d="M8.5 10.5c.3 2.6 2.4 4.7 5 5" /></svg>
);
export const IconWave = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10.5V4a2 2 0 0 0-4 0v7" /><path d="M10 10V6a2 2 0 0 0-4 0v9c0 3.3 2.7 6 6 6h2a6 6 0 0 0 6-6v-3a2 2 0 0 0-4 0" /></svg>
);
export const IconSearch = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
export const IconCalendarUsers = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><circle cx="9" cy="14" r="1.5" /><path d="M6.5 18c.4-1.3 1.5-2 2.5-2s2.1.7 2.5 2" /></svg>
);
export const IconPlay = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="2" y="4" width="20" height="16" rx="4" /><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none" /></svg>
);
export const IconSparkle = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" /></svg>
);
export const IconCamera = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
);
export const IconPin = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
);
