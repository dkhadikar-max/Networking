import React from 'react';

export type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  active?: boolean;
};

// Base SVG configuration for BYN linear icons
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// --- 1. Core Navigation & App Shell ---

export function IconDiscover({ size = 20, className, strokeWidth = 1.75, style, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <circle cx="11" cy="11" r="8" fill="currentColor" stroke="currentColor" />
        <line x1="16.8" y1="16.8" x2="21.5" y2="21.5" strokeWidth={strokeWidth + 0.5} />
        <circle cx="11" cy="11" r="3" fill="#ffffff" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="11" cy="11" r="7.5" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
      <circle cx="11" cy="11" r="2" fill="currentColor" stroke="none" />
      <line x1="11" y1="6" x2="11" y2="7.5" />
      <line x1="11" y1="14.5" x2="11" y2="16" />
      <line x1="6" y1="11" x2="7.5" y2="11" />
      <line x1="14.5" y1="11" x2="16" y2="11" />
    </svg>
  );
}

export function IconConnections({ size = 20, className, strokeWidth = 1.75, style, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <circle cx="8" cy="8" r="3.5" fill="currentColor" />
        <path d="M3 19v-1a5 5 0 0 1 10 0v1" fill="currentColor" />
        <circle cx="16.5" cy="7.5" r="2.5" fill="currentColor" />
        <path d="M14.5 14.5a4 4 0 0 1 6.5 2.5v2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M3 19v-1a5 5 0 0 1 10 0v1" />
      <circle cx="16.5" cy="7.5" r="2.5" />
      <path d="M14.5 14.5a4 4 0 0 1 6.5 2.5v2" />
      <path d="M11 12l2.5-1" strokeDasharray="1 1.5" />
    </svg>
  );
}

export function IconChat({ size = 20, className, strokeWidth = 1.75, style, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M7 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-4.5 3.5A.5.5 0 0 1 3.7 20V7a3 3 0 0 1 3-3z" fill="currentColor" />
        <line x1="8" y1="9" x2="16" y2="9" stroke="#ffffff" strokeWidth="1.8" />
        <line x1="8" y1="12.5" x2="13.5" y2="12.5" stroke="#ffffff" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M7 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-4.5 3.5A.5.5 0 0 1 3.7 20V7a3 3 0 0 1 3-3z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="12.5" x2="13.5" y2="12.5" />
    </svg>
  );
}

export function IconCircles({ size = 20, className, strokeWidth = 1.75, style, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="6" r="3" fill={active ? 'currentColor' : 'none'} />
      <circle cx="6" cy="17" r="3" fill={active ? 'currentColor' : 'none'} />
      <circle cx="18" cy="17" r="3" fill={active ? 'currentColor' : 'none'} />
      <line x1="10.5" y1="8.5" x2="7.5" y2="14.5" strokeWidth={active ? 2 : strokeWidth} />
      <line x1="13.5" y1="8.5" x2="16.5" y2="14.5" strokeWidth={active ? 2 : strokeWidth} />
      <line x1="9" y1="17" x2="15" y2="17" strokeWidth={active ? 2 : strokeWidth} />
    </svg>
  );
}

export function IconProfile({ size = 20, className, strokeWidth = 1.75, style, active }: IconProps) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

// --- 2. High-Intent Decision Badges & Marks ---

export function IconPriority({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <polygon points="13 2.5 4.5 13 11 13 10 21.5 19.5 11 13 11 14.5 2.5" />
    </svg>
  );
}

export function IconTrust({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M12 2.5L4.5 5.5v6.2c0 5.2 3.2 9.8 7.5 11 4.3-1.2 7.5-5.8 7.5-11V5.5L12 2.5z" />
      <polyline points="9 11.5 11 13.5 15.5 9" />
    </svg>
  );
}

export function IconVerified({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2.2l2.3 1.8 2.9-.6 1.4 2.6 2.9.8-.3 3 2.2 2-1.5 2.6.9 2.9-2.7 1.3-.8 2.9-3-.3-2.1 2.1-2.6-1.5-2.9.9-1.3-2.7-2.9-.8.3-3-2.2-2 1.5-2.6-.9-2.9 2.7-1.3.8-2.9 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconIntent({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function IconBuilding({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M12 2.5c2.8 2.2 4.5 6 4.5 10.5l-4.5 3-4.5-3c0-4.5 1.7-8.3 4.5-10.5z" />
      <circle cx="12" cy="9" r="1.75" />
      <path d="M7.5 13L4 16.5v2h2l3.5-3.5" />
      <path d="M16.5 13L20 16.5v2h-2l-3.5-3.5" />
    </svg>
  );
}

export function IconLookingFor({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M16 11l2-2a3 3 0 0 0-4.24-4.24L11 7" />
      <path d="M8 13l-2 2a3 3 0 0 0 4.24 4.24L13 17" />
      <line x1="9.5" y1="10.5" x2="14.5" y2="15.5" />
    </svg>
  );
}

export function IconInsight({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <path d="M12 2.5c0 4.5 4.5 9.5 9.5 9.5-5 0-9.5 5-9.5 9.5 0-4.5-4.5-9.5-9.5-9.5 5 0 9.5-5 9.5-9.5z" />
    </svg>
  );
}

export function IconLocation({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.8 6.5 12.5 6.5 12.5s6.5-7.7 6.5-12.5a6.5 6.5 0 0 0-6.5-6.5z" />
      <circle cx="12" cy="9" r="2.25" />
    </svg>
  );
}

export function IconSkills({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <polygon points="12 2.5 21 8.5 12 21.5 3 8.5" />
      <line x1="3" y1="8.5" x2="21" y2="8.5" />
      <polyline points="7.5 8.5 12 2.5 16.5 8.5" />
      <polyline points="7.5 8.5 12 21.5 16.5 8.5" />
    </svg>
  );
}

export function IconInterests({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="12 5.5 13.8 10.2 18.5 12 13.8 13.8 12 18.5 10.2 13.8 5.5 12 10.2 10.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// --- 3. Interactive UI Controls ---

export function IconSkip({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

export function IconConnect({ size = 16, className, strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

export function IconBack({ size = 20, className, strokeWidth = 2.2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 18, className, strokeWidth = 2.2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconArrowRight({ size = 18, className, strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function IconClose({ size = 16, className, strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconMenu({ size = 24, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function IconEdit({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 18.5l-4 1 1-4L16.5 3.5z" />
      <line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
    </svg>
  );
}

export function IconTrash({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <line x1="10" y1="10" x2="10" y2="16" />
      <line x1="14" y1="10" x2="14" y2="16" />
    </svg>
  );
}

export function IconSearch({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="11" cy="11" r="7.5" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" strokeWidth={strokeWidth + 0.25} />
    </svg>
  );
}

export function IconClear({ size = 14, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} style={style}>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.1" stroke="none" />
      <line x1="9" y1="9" x2="15" y2="15" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="15" y1="9" x2="9" y2="15" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconFilters({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="8" cy="6" r="2.2" fill="#ffffff" stroke="currentColor" strokeWidth={strokeWidth} />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="16" cy="12" r="2.2" fill="#ffffff" stroke="currentColor" strokeWidth={strokeWidth} />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="10" cy="18" r="2.2" fill="#ffffff" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function IconSend({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <line x1="21.5" y1="2.5" x2="10" y2="14" strokeWidth={1.8} />
      <polygon points="21.5 2.5 14.5 21.5 10 14 2.5 9.5 21.5 2.5" />
    </svg>
  );
}

export function IconAttach({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function IconMore({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  );
}

export function IconCopy({ size = 16, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M4.5 15.5H3.5a2 2 0 0 1-2-2V3.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconSignOut({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconExternalLink({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function IconFeedback({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="11" />
      <circle cx="12" cy="13.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

// --- 4. Notifications, Real-Time & Receipts ---

export function IconBell({ size = 20, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconBellUnread({ size = 20, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <circle cx="18" cy="4.5" r="3" fill="#F4A259" stroke="#ffffff" strokeWidth={1.5} />
    </svg>
  );
}

export function IconReceiptDelivered({ size = 14, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <polyline points="2 13 6.5 17.5 16 8" />
      <polyline points="8 13 12.5 17.5 22 8" />
    </svg>
  );
}

export function IconReceiptRead({ size = 14, className, strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} stroke="#157A6E" className={className} style={style}>
      <polyline points="2 13 6.5 17.5 16 8" />
      <polyline points="8 13 12.5 17.5 22 8" />
    </svg>
  );
}

export function IconTimer({ size = 14, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="10" y1="2" x2="14" y2="2" />
    </svg>
  );
}

// --- 5. Social & Ecosystem Links ---

export function IconLinkedIn({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

export function IconInstagram({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconX({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <path d="M4 4.5l6.7 8.9L4 20h2.5l5.3-5.7L16.2 20H20l-7-9.3L19.3 4.5H16.8l-4.9 5.3L7.7 4.5H4z" />
    </svg>
  );
}

export function IconWhatsApp({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} style={style}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9.5 8.5c-.3 0-.6.1-.8.4-.3.4-.9 1.1-.9 2.2 0 1.2.9 2.3 1 2.5.2.2 1.8 2.8 4.3 3.9 2.1.9 2.5.7 3 .7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4s-1.6-.8-1.8-.9c-.3-.1-.5-.1-.7.2-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.7.1-.1.3-.4.5-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.7-1-2.3-.2-.5-.5-.4-.7-.4z" fill="#ffffff" />
    </svg>
  );
}

export function IconWebsite({ size = 18, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <line x1="2.5" y1="12" x2="21.5" y2="12" />
      <path d="M12 2.5a15 15 0 0 1 4 9.5 15 15 0 0 1-4 9.5 15 15 0 0 1-4-9.5 15 15 0 0 1 4-9.5z" />
    </svg>
  );
}

// --- 6. Empty States & System Feedback ---

export function IconEmptyChat({ size = 32, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M7 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-4 3V7a3 3 0 0 1 3-3z" strokeDasharray="2.5 2.5" />
      <circle cx="9" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconEmptySearch({ size = 32, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="11" cy="11" r="7.5" strokeDasharray="3 3" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" strokeWidth={2} />
      <line x1="8.5" y1="11" x2="13.5" y2="11" strokeLinecap="round" />
    </svg>
  );
}

export function IconEmptyDiscover({ size = 26, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeDasharray="3 3" opacity="0.4" />
      <line x1="12" y1="12" x2="16.5" y2="7.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconActionPhoto({ size = 28, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="12" cy="10" r="3.2" />
      <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="18" cy="6" r="2" fill="#F4A259" stroke="none" />
    </svg>
  );
}

export function IconEmptyNotifications({ size = 24, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeDasharray="3 3" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconSuccess({ size = 24, className, strokeWidth = 2, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="7.5 12.5 10.5 15.5 16.5 9" />
    </svg>
  );
}

export function IconAlert({ size = 24, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="8" x2="12" y2="13" strokeWidth={2} />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// --- 7. Monetization & Value Feature Badges (Upgrade Page) ---

export function IconFeatureBoost({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <polygon points="13 5.5 6.5 13 12 13 11 18.5 17.5 11 12 11 13 5.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFeatureReveal({ size = 20, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFeaturePriority({ size = 20, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <polyline points="3 7 12 13 21 7" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFeatureSpotlight({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <polygon points="12 5.5 13.8 9.5 18 10 14.8 13 15.8 17.5 12 15 8.2 17.5 9.2 13 6 10 10.2 9.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFeatureRadius({ size = 20, className, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" strokeDasharray="2 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
    </svg>
  );
}
