// Funnel events for Google Analytics 4 (G-5NQDBYG4CJ).
//
// GA itself is loaded only after the visitor accepts analytics cookies
// (components/ui/CookieBanner.tsx). track() is a no-op until then, and
// again after consent is withdrawn via "Cookie settings".
//
// Never pass personal data here: no names, emails, user ids, connection
// ids or message text. Only the event name and coarse, non-identifying
// labels (a step name, an error code, a fixed option value).

import { hasAnalyticsConsent } from '@/components/ui/CookieBanner';

type EventParams = Record<string, string | number | boolean>;

export function track(event: string, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  if (!window.__ga_loaded || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', event, params);
  } catch {
    // analytics must never break the product
  }
}
