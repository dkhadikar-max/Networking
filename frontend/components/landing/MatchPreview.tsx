// Static reuse of the real match-state visual classes (`.match-avatars`,
// `.match-title`, `.match-sub`, `.match-actions` — from app/(app)/app.css,
// the same classes MatchModal.tsx uses live). Deliberately not the modal
// itself: MatchModal renders as a fixed full-screen overlay, which isn't
// appropriate inline in a marketing-page scroll. No client JS needed.
import Avatar from '@/components/ui/Avatar';
import { SAMPLE_USER } from './samples';

export default function MatchPreview() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center', background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(255,255,255,0.9)', padding: '36px 28px' }}>
      <div className="match-avatars">
        <Avatar src={null} name="You" size={92} className="match-avatar match-avatar--left" />
        <div className="match-spark">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
          </svg>
        </div>
        <Avatar src={null} name={SAMPLE_USER.name} size={92} className="match-avatar match-avatar--right" />
      </div>
      <h3 className="match-title">It&apos;s a match!</h3>
      <p className="match-sub">You and {SAMPLE_USER.name} are both interested — say hello and start building something together.</p>
      <div className="match-actions">
        <span className="profile-action-btn profile-action-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Send a message →</span>
      </div>
    </div>
  );
}
