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
      <ProfileEdit
        user={user}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <ProfileView
      user={user}
      isSelf
      onEdit={() => setEditing(true)}
    />
  );
}
