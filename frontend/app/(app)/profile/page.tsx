'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProfileView from '@/components/profile/ProfileView';
import ProfileEdit from '@/components/profile/ProfileEdit';
import type { User } from '@/lib/types';

export default function OwnProfilePage() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  function handleSave(updated: User) {
    setUser(updated);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ProfileEdit
          user={user}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // ProfileView renders its own full-profile header (back + logo + Priority)
  // via `data-full-profile`. Rendering an additional generic `.screen-header`
  // above it stacked two headers at the top of the viewport, so it's dropped
  // here. `/profile/[id]` already never rendered that outer header.
  return (
    <div className="profile-page-wrap" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <ProfileView
        user={user}
        isSelf
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}
