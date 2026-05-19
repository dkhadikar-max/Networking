'use client';

import { motion } from 'framer-motion';
import clsx from 'clsx';

interface Props {
  score: number;
  connections: number;
  activeConversations: number;
  profileScore: number;
}

function MomentumLabel(score: number) {
  if (score >= 80) return { label: 'Strong',        color: 'text-emerald-600' };
  if (score >= 55) return { label: 'Growing',       color: 'text-[var(--teal)]' };
  if (score >= 30) return { label: 'Getting there', color: 'text-[var(--accent)]' };
  return              { label: 'Just starting',  color: 'text-[var(--text-muted)]' };
}

function StatPill({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-white border border-[var(--border)]">
      <span className="text-xl font-bold text-[var(--text)]">{value}</span>
      <span className="text-xs font-medium text-[var(--text)] mt-0.5">{label}</span>
      <span className="text-xs text-[var(--text-muted)]">{sub}</span>
    </div>
  );
}

export default function NetworkMomentum({ score, connections, activeConversations, profileScore }: Props) {
  const { label, color } = MomentumLabel(score);
  const circumference = 2 * Math.PI * 36;
  const dash = (score / 100) * circumference;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text)]">Network momentum</h3>
        <span className={clsx('text-sm font-bold', color)}>{label}</span>
      </div>

      <div className="flex items-center gap-6">
        {/* Circular gauge */}
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
            <circle cx="40" cy="40" r="36" fill="none" stroke="var(--border)" strokeWidth="7" />
            <motion.circle
              cx="40" cy="40" r="36" fill="none"
              stroke="var(--primary)" strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - dash }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-[var(--primary)]">{score}</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 flex-1">
          <StatPill label="Connections"    value={connections}          sub="total" />
          <StatPill label="Active chats"   value={activeConversations}  sub="threads" />
          <StatPill label="Profile"        value={`${profileScore}%`}   sub="complete" />
        </div>
      </div>

      {score < 80 && (
        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-3">
          {score < 30
            ? 'Add a photo and make your first connection to get started.'
            : score < 55
            ? 'Message your connections regularly to keep momentum growing.'
            : 'Keep it up — strong networks compound over time.'}
        </p>
      )}
    </div>
  );
}
