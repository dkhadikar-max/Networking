'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import { apiGet } from '@/lib/api';
import ProfileView from '@/components/profile/ProfileView';
import type { User } from '@/lib/types';

type ProfileData = User;

type Props = {
  userId: string | null;
  userObj?: User;
  onClose: () => void;
  onConnect: () => Promise<void>;
};

export default function ProfileInspectOverlay({ userId, userObj, onClose, onConnect }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(userObj ?? null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId) return;
    router.push(`/profile/${userId}`);
  }, [userId, router]);

  if (!userId) return null;

  return null;
}
