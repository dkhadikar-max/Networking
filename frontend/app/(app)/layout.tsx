'use client';

import './app.css';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { withNext } from '@/lib/authRedirect';
import { ProfileDrawerProvider, useProfileDrawer } from '@/context/ProfileDrawerContext';
import BottomNav from '@/components/layout/BottomNav';
import DesktopNav from '@/components/layout/DesktopNav';
import { ToastProvider } from '@/components/ui/Toast';
import ProfileDrawer from '@/components/ui/ProfileDrawer';
import { registerWebPush } from '@/lib/webpush';

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

  useEffect(() => {
    if (loading) return;
    // Preserve where the user was actually trying to go (e.g. a Circles
    // post CTA landing on /circles?post=:id) across the whole auth chain —
    // without this, a logged-out visitor bounces through login/onboarding
    // and lands on the generic /discover, losing the page that brought
    // them in. See lib/authRedirect.ts.
    //
    // Read via window.location rather than useSearchParams(): this layout
    // wraps every (app) page, some of which (e.g. /circles/groups) are
    // statically prerendered at build time, and useSearchParams() here
    // requires a Suspense boundary around the whole tree to avoid a build
    // failure (confirmed against a real `next build` — see node_modules/
    // next/dist/docs .../missing-suspense-with-csr-bailout). This only ever
    // runs inside an effect (never during render/SSR), so window is always
    // defined here regardless.
    const search = window.location.search;
    const here = search ? `${path}${search}` : path;
    if (!user) { router.replace(withNext('/login', here)); return; }
    if (!user.email_verified) { router.replace(withNext('/verify', here)); return; }
    if (user.onboarding_stage !== 'complete' && !path.startsWith('/onboarding')) {
      router.replace(withNext('/onboarding', here)); return;
    }
  }, [user, loading, router, path]);

  useEffect(() => {
    if (!user || user.onboarding_stage !== 'complete') return;
    registerWebPush();
  }, [user?.id]);

  if (loading || !user) {
    return (
      <div className="app-wrap">
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrap">
      <DesktopNav />
      <main className="app-views">
        {children}
      </main>
      <BottomNav />
      <ShellDrawer />
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
