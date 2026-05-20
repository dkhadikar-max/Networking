'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const INTENTS = [
  { label: 'Networking',                icon: '🤝', desc: 'Expand your professional circle' },
  { label: 'Find Opportunities',        icon: '🔍', desc: 'Discover jobs, projects & gigs' },
  { label: 'Build Startup Connections', icon: '🚀', desc: 'Connect with founders & builders' },
  { label: 'Find Co-founder',           icon: '👥', desc: 'Find your perfect business partner' },
  { label: 'Hiring',                    icon: '💼', desc: 'Source talent for your team' },
  { label: 'Find Clients',              icon: '🎯', desc: 'Grow your customer base' },
  { label: 'Mentorship',                icon: '🎓', desc: 'Give or receive guidance' },
  { label: 'Learn from People',         icon: '📚', desc: 'Absorb knowledge from experts' },
  { label: 'Community',                 icon: '🌐', desc: 'Be part of something bigger' },
  { label: 'Investment Opportunities',  icon: '💰', desc: 'Find deals or raise capital' },
];

interface Props {
  onNext: (intents: string[]) => void;
  loading: boolean;
}

export default function IntentSelector({ onNext, loading }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else { next.add(label); }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">What brings you here?</h2>
        <p className="text-[var(--text-secondary)] mt-1">Select all that apply — we&apos;ll personalise your experience.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {INTENTS.map((intent, i) => {
          const active = selected.has(intent.label);
          return (
            <motion.button
              key={intent.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => toggle(intent.label)}
              className={clsx(
                'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                active
                  ? 'border-[var(--primary)] bg-[var(--highlight)]'
                  : 'border-[var(--border)] bg-white hover:border-[var(--teal)]'
              )}
            >
              <span className="text-2xl leading-none mt-0.5">{intent.icon}</span>
              <div>
                <p className={clsx('font-semibold text-sm', active ? 'text-[var(--primary)]' : 'text-[var(--text)]')}>
                  {intent.label}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{intent.desc}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={() => onNext([...selected])}
        disabled={selected.size === 0 || loading}
        className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold disabled:opacity-40 hover:bg-[var(--primary-dark)] transition-colors"
      >
        {loading ? 'Saving…' : 'Continue →'}
      </button>
    </div>
  );
}
