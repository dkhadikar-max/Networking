'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { DrawerProfile } from '@/components/ui/ProfileDrawer';

type DrawerOptions = {
  onConnect?: () => Promise<void>;
  onSkip?: () => void;
};

type DrawerState = { profile: DrawerProfile; options: DrawerOptions } | null;

type Ctx = {
  drawerState: DrawerState;
  openProfile: (profile: DrawerProfile, options?: DrawerOptions) => void;
  updateDrawerProfile: (profile: DrawerProfile) => void;
  closeProfile: () => void;
};

const ProfileDrawerContext = createContext<Ctx | null>(null);

export function ProfileDrawerProvider({ children }: { children: React.ReactNode }) {
  const [drawerState, setDrawerState] = useState<DrawerState>(null);

  const openProfile = useCallback((profile: DrawerProfile, options: DrawerOptions = {}) => {
    setDrawerState({ profile, options });
  }, []);

  const updateDrawerProfile = useCallback((profile: DrawerProfile) => {
    setDrawerState(prev => prev ? { ...prev, profile } : prev);
  }, []);

  const closeProfile = useCallback(() => setDrawerState(null), []);

  return (
    <ProfileDrawerContext.Provider value={{ drawerState, openProfile, updateDrawerProfile, closeProfile }}>
      {children}
    </ProfileDrawerContext.Provider>
  );
}

export function useProfileDrawer() {
  const ctx = useContext(ProfileDrawerContext);
  if (!ctx) throw new Error('useProfileDrawer must be used inside ProfileDrawerProvider');
  return ctx;
}
