'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ProfileQuickPeek from '@/components/profile/ProfileQuickPeek';
import type { DiscoverProfile, User } from '@/lib/types';
import { IconClose } from '@/components/ui/BynIcons';

function getUid(p: DiscoverProfile | null): string {
  if (!p) return '';
  return (p.user as { id?: string } | undefined)?.id ?? (p as { id?: string }).id ?? '';
}

type Props = {
  profile: DiscoverProfile | null;
  onClose: () => void;
};

/**
 * Discovery → Quick Peek step. Never a route change — /discover stays
 * mounted underneath, so closing this is instant and the swipe stack is
 * untouched. Renders ProfileQuickPeek (the compact decision layer) from
 * data Discovery already fetched — no re-fetch needed. "View Full Profile"
 * is the only way forward from here, into the real editorial /profile/[id]
 * document. See the 2026-08-29 Profile↔Discovery IA audit — this overlay
 * used to skip straight to /profile/[id], collapsing Peek out of the flow.
 */
export default function ProfileInspectOverlay({ profile, onClose }: Props) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!profile) return;
    // Keyboard users land wherever focus was on the Discover card (usually
    // the identity-tap button) — move focus into the dialog so Tab reaches
    // its own controls next, not whatever's still in the background, and
    // remember where to send focus back on close.
    triggerRef.current = document.activeElement;
    panelRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [profile, onClose]);

  if (!profile) return null;

  const user = (profile.user ?? profile) as User;
  const uid = getUid(profile);

  function viewFullProfile() {
    onClose();
    if (uid) router.push(`/profile/${uid}`);
  }

  return (
    <div className="inspect-overlay-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick preview of ${user.name ?? 'this profile'}`}
        tabIndex={-1}
        className="inspect-overlay-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="inspect-overlay-handle" />
        <div className="inspect-overlay-header">
          <span />
          <button type="button" className="inspect-overlay-close" onClick={onClose} aria-label="Close">
            <IconClose size={16} strokeWidth={2.5} />
          </button>
        </div>
        <div className="inspect-overlay-body">
          <ProfileQuickPeek user={user} onViewFull={viewFullProfile} />
        </div>
      </div>
    </div>
  );
}
