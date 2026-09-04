'use client';

// Renders the REAL profile screen component with illustrative sample data.
import ProfileView from '@/components/profile/ProfileView';
import { SAMPLE_USER } from './samples';

// Unlike MatchPreview/ConversationPreview (which deliberately reimplement
// their screens statically specifically to avoid embedding a component that
// uses position:fixed overlays — see those files' own comments), this one
// embeds ProfileView directly. ProfileView's Skip/Connect action bar
// (.profile-action-bar) is `position:fixed`, calibrated for the real
// in-app viewport (clearing .bottom-nav / DesktopNav's sidebar — see
// app/(app)/app.css). Embedded here with no such app-shell context, it was
// pinning itself to the actual browser viewport instead of this small
// card — detached from the card, overlapping its bottom edge and the
// "Looking for" pill depending on real page scroll position.
// `contain: 'layout'` makes this div a CSS containing block for
// position:fixed descendants (spec-standard technique), so the bar
// resolves against this card instead of the browser viewport. The
// matching CSS override for the bar's own real-app-specific offset/width
// math lives in app.css, right next to the rules it overrides.
// maxHeight 640 -> 720: with the bar correctly contained (above), it still
// covers its own ~74px band at the bottom of whatever's visible — at 640
// that band landed exactly on the "Looking for" pill's natural position
// (measured ~618px from content top), obscuring it at first glance, before
// any scroll interaction. 720 clears it with room to spare. Content itself
// (SAMPLE_USER via the real ProfileView) is unchanged — this only affects
// how much of it this landing-page card shows before its own internal
// scroll takes over.
export default function ProfilePreview() {
  return (
    <div className="profile-preview-shell" style={{ maxWidth: 420, margin: '0 auto', maxHeight: 720, overflowY: 'auto', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(255,255,255,0.9)', background: 'var(--card)', contain: 'layout' }}>
      <ProfileView user={SAMPLE_USER} isSelf={false} connected={false} onConnect={async () => {}} />
    </div>
  );
}
