'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import clsx from 'clsx';
import { Recommendation } from '@/lib/retention/recommendations';

const PRIORITY_COLORS = {
  high:   'border-[var(--accent)] bg-orange-50',
  medium: 'border-[var(--teal)] bg-[var(--highlight)]',
  low:    'border-[var(--border)] bg-white',
};

const PRIORITY_BADGE = {
  high:   { label: 'Do today',  cls: 'bg-[var(--accent)] text-white' },
  medium: { label: 'This week', cls: 'bg-[var(--teal)] text-white' },
  low:    { label: 'Explore',   cls: 'bg-[var(--border)] text-[var(--text-secondary)]' },
};

interface Props {
  recommendations: Recommendation[];
  onDismiss?: (id: string) => void;
}

export default function DailyRecommendations({ recommendations, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = recommendations.filter(r => !dismissed.has(r.id));

  const dismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    onDismiss?.(id);
  };

  if (visible.length === 0) {
    return (
      <div className="text-center py-10 text-[var(--text-muted)]">
        <p className="text-3xl mb-2">🎉</p>
        <p className="font-medium text-[var(--text)]">You're all caught up!</p>
        <p className="text-sm mt-1">Check back tomorrow for new actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text)]">Today's actions</h3>
        <span className="text-sm text-[var(--text-muted)]">{visible.length} remaining</span>
      </div>

      <AnimatePresence>
        {visible.map((rec, i) => {
          const badge = PRIORITY_BADGE[rec.priority];
          return (
            <motion.div
              key={rec.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ delay: i * 0.05 }}
              className={clsx('rounded-xl border-2 p-4', PRIORITY_COLORS[rec.priority])}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5 shrink-0">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-sm text-[var(--text)]">{rec.title}</p>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{rec.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    {rec.href && (
                      <a
                        href={rec.href}
                        className="text-sm font-semibold text-[var(--primary)] hover:underline"
                      >
                        {rec.cta} →
                      </a>
                    )}
                    <button
                      onClick={() => dismiss(rec.id)}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
