/**
 * BYN Analytics — strict event schema
 * Swap logEvent() body for Firebase/Amplitude/Mixpanel in production.
 */

// ── Event names (locked schema) ────────────────────────────────────────────
export const EVENTS = {
  SWIPE_ACTION:     'swipe_action',
  PROFILE_OPEN:     'profile_open',
  MESSAGE_SENT:     'message_sent',
  SUPPORT_CLICKED:  'support_clicked',
  FILTER_APPLIED:   'filter_applied',
  MATCH_MADE:       'match_made',
  APP_OPEN:         'app_open',
};

// ── Core logger ────────────────────────────────────────────────────────────
function logEvent(name, properties = {}) {
  const payload = {
    event:      name,
    properties: { ...properties, timestamp: new Date().toISOString() },
  };

  // DEV: console output
  if (__DEV__) {
    console.log('[Analytics]', payload.event, payload.properties);
  }

  // PROD: wire up your analytics SDK here, e.g.:
  // firebase.analytics().logEvent(name, properties);
  // amplitude.track(name, properties);
}

// ── Typed helpers ──────────────────────────────────────────────────────────

/** direction: 'left' | 'right', userId: string */
export function trackSwipe(direction, userId) {
  logEvent(EVENTS.SWIPE_ACTION, { direction, userId: String(userId) });
}

/** userId: string */
export function trackProfileOpen(userId) {
  logEvent(EVENTS.PROFILE_OPEN, { userId: String(userId) });
}

/** toUserId: string, type: 'priority' | 'regular' */
export function trackMessageSent(toUserId, type = 'priority') {
  logEvent(EVENTS.MESSAGE_SENT, { toUserId: String(toUserId), type });
}

/** source: string */
export function trackSupportClicked(source = 'settings') {
  logEvent(EVENTS.SUPPORT_CLICKED, { source });
}

/** filters: object */
export function trackFilterApplied(filters) {
  logEvent(EVENTS.FILTER_APPLIED, { filters });
}

/** userId: string (the matched user) */
export function trackMatchMade(userId) {
  logEvent(EVENTS.MATCH_MADE, { userId: String(userId) });
}

export function trackAppOpen() {
  logEvent(EVENTS.APP_OPEN, {});
}
