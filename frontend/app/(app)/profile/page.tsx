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

  return (
    <div className="profile-page-wrap" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="screen-header">
        <h1>Profile</h1>
      </div>
      <ProfileView
        user={user}
        isSelf
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}
