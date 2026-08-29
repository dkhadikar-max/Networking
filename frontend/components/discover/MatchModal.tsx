'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';

type Props = {
  open: boolean;
  onClose: () => void;
  connectionId: string | null;
  myPhoto?: string | null;
  myName: string;
  theirPhoto?: string | null;
  theirName: string;
};

export default function MatchModal({ open, onClose, connectionId, myPhoto, myName, theirPhoto, theirName }: Props) {
  const router = useRouter();
  // CSS's blanket prefers-reduced-motion rule (globals.css) doesn't reach
  // framer-motion's own animation engine — this does. When true, every
  // transition below collapses to instant (no spring, no stagger delay);
  // the initial/animate end-states are unchanged, so content still shows.
  const reduceMotion = useReducedMotion();
  const t = (normal: Transition): Transition => (reduceMotion ? { duration: 0 } : normal);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    // Same reasoning as the Peek overlay: send focus into the dialog on
    // open (rather than leaving it on the Connect button behind it) and
    // back to that trigger on close.
    triggerRef.current = document.activeElement;
    panelRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
          <motion.div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t({ duration: 0.2 })}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`You and ${theirName} matched`}
            tabIndex={-1}
            className="relative z-10 w-full max-w-[360px] sm:max-w-[380px] bg-white rounded-3xl p-6 sm:p-8 text-center shadow-2xl border border-slate-100 match-modal"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={t({ type: 'spring', damping: 22, stiffness: 320 })}
          >
            <div className="match-avatars">
              <motion.div
                initial={{ x: -46, rotate: -8, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                transition={t({ type: 'spring', damping: 14, stiffness: 260, delay: 0.05 })}
              >
                <Avatar src={myPhoto} name={myName} size={92} className="match-avatar match-avatar--left" />
              </motion.div>
              <motion.div
                className="match-spark"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={t({ type: 'spring', damping: 10, stiffness: 320, delay: 0.35 })}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--accent)">
                  <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
                </svg>
              </motion.div>
              <motion.div
                initial={{ x: 46, rotate: 8, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                transition={t({ type: 'spring', damping: 14, stiffness: 260, delay: 0.05 })}
              >
                <Avatar src={theirPhoto} name={theirName} size={92} className="match-avatar match-avatar--right" />
              </motion.div>
            </div>

            <motion.h2
              className="match-title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t({ delay: 0.4, duration: 0.25 })}
            >
              It&apos;s a match!
            </motion.h2>
            <motion.p
              className="match-sub"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t({ delay: 0.48, duration: 0.25 })}
            >
              You and {theirName} are both interested — say hello and start building something together.
            </motion.p>

            <motion.div
              className="match-actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t({ delay: 0.56, duration: 0.25 })}
            >
              <button
                className="profile-action-btn profile-action-primary"
                onClick={() => { onClose(); if (connectionId) router.push(`/chat/${connectionId}`); }}
              >
                Send a message →
              </button>
              <button className="match-dismiss" onClick={onClose}>Keep exploring</button>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
