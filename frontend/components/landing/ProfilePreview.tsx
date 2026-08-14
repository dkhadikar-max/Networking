'use client';

// Renders the REAL profile screen component with illustrative sample data.
import ProfileView from '@/components/profile/ProfileView';
import { SAMPLE_USER } from './samples';

export default function ProfilePreview() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', maxHeight: 640, overflowY: 'auto', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(255,255,255,0.9)', background: 'var(--card)' }}>
      <ProfileView user={SAMPLE_USER} isSelf={false} connected={false} onConnect={async () => {}} />
    </div>
  );
}
