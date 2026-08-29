'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Recommendation } from '@/lib/retention/recommendations';

const PRIORITY_COLORS = {
  high:   'border-amber-300/80 bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 shadow-2xs',
  medium: 'border-teal-300/80 bg-gradient-to-br from-teal-500/10 via-white to-teal-500/5 shadow-2xs',
  low:    'border-slate-200 bg-white shadow-2xs',
};

const PRIORITY_BADGE = {
  high:   { label: 'High Priority', cls: 'bg-amber-500 text-white font-extrabold shadow-xs' },
  medium: { label: 'This Week',    cls: 'bg-[#157A6E] text-white font-extrabold shadow-xs' },
  low:    { label: 'Explore',      cls: 'bg-slate-100 text-slate-600 font-bold' },
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
      <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
        <p className="text-3xl mb-2">🎉</p>
        <p className="font-extrabold text-slate-800 text-base">You&apos;re all caught up!</p>
        <p className="text-xs text-slate-500 mt-1">Check back tomorrow for fresh collaboration actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Today&apos;s Recommended Actions</h3>
        <span className="text-xs font-semibold text-slate-400">{visible.length} remaining</span>
      </div>

      <AnimatePresence>
        {visible.map((rec, i) => {
          const badge = PRIORITY_BADGE[rec.priority];
          const isInternal = rec.href?.startsWith('/');

          return (
            <motion.div
              key={rec.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ delay: i * 0.05 }}
              className={clsx('rounded-2xl border p-4 sm:p-5 transition-all', PRIORITY_COLORS[rec.priority])}
            >
              <div className="flex items-start gap-3.5">
                <span className="text-2xl leading-none mt-0.5 shrink-0 select-none">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-extrabold text-sm text-slate-900 tracking-tight">{rec.title}</p>
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider', badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{rec.description}</p>
                  <div className="flex items-center gap-4 mt-3 pt-1">
                    {rec.href && (
                      isInternal ? (
                        <Link
                          href={rec.href}
                          className="text-xs font-extrabold text-[#157A6E] hover:text-[#0D5F58] hover:underline flex items-center gap-1"
                        >
                          <span>{rec.cta}</span>
                          <span>→</span>
                        </Link>
                      ) : (
                        <a
                          href={rec.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-extrabold text-[#157A6E] hover:text-[#0D5F58] hover:underline flex items-center gap-1"
                        >
                          <span>{rec.cta}</span>
                          <span>→</span>
                        </a>
                      )
                    )}
                    <button
                      onClick={() => dismiss(rec.id)}
                      className="text-xs text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
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
