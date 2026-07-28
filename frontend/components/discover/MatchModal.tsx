'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="match-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="match-modal"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          >
            <div className="match-avatars">
              <motion.div
                initial={{ x: -46, rotate: -8, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.05 }}
              >
                <Avatar src={myPhoto} name={myName} size={92} className="match-avatar match-avatar--left" />
              </motion.div>
              <motion.div
                className="match-spark"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 320, delay: 0.35 }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--accent)">
                  <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
                </svg>
              </motion.div>
              <motion.div
                initial={{ x: 46, rotate: 8, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.05 }}
              >
                <Avatar src={theirPhoto} name={theirName} size={92} className="match-avatar match-avatar--right" />
              </motion.div>
            </div>

            <motion.h2
              className="match-title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.25 }}
            >
              It&apos;s a match!
            </motion.h2>
            <motion.p
              className="match-sub"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.48, duration: 0.25 }}
            >
              You and {theirName} are both interested — say hello and start building something together.
            </motion.p>

            <motion.div
              className="match-actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.56, duration: 0.25 }}
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
        </>
      )}
    </AnimatePresence>
  );
}
