'use client';

import type { CSSProperties } from 'react';

// Reopens the cookie banner so a visitor can change or withdraw analytics
// consent at any time, as the privacy policy promises (section 4).
// CookieBanner listens for this event.
export const OPEN_COOKIE_SETTINGS_EVENT = 'byn:open-cookie-settings';

export default function CookieSettingsLink({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
      className={className}
      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', ...style }}
    >
      Cookie settings
    </button>
  );
}
