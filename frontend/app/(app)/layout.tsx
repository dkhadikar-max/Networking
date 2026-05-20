'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProfileDrawerProvider, useProfileDrawer } from '@/context/ProfileDrawerContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { ToastProvider } from '@/components/ui/Toast';
import ProfileDrawer from '@/components/ui/ProfileDrawer';

function ShellDrawer() {
  const { drawerState, closeProfile } = useProfileDrawer();
  return (
    <ProfileDrawer
      profile={drawerState?.profile ?? null}
      onClose={closeProfile}
      onConnect={drawerState?.options.onConnect}
      onSkip={drawerState?.options.onSkip}
    />
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!user.email_verified) { router.replace('/verify'); return; }
    if (user.onboarding_stage !== 'complete' && !path.startsWith('/onboarding')) {
      router.replace('/onboarding'); return;
    }
  }, [user, loading, router, path]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {isDesktop === true && <Sidebar />}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden relative${isDesktop === false ? ' pb-16' : ''}`}>
        {children}
        <ShellDrawer />
      </main>
      {isDesktop === false && <BottomNav />}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ProfileDrawerProvider>
        <AppShell>{children}</AppShell>
      </ProfileDrawerProvider>
    </ToastProvider>
  );
}
