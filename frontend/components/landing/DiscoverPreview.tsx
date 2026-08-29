'use client';

import { useState, useEffect } from 'react';
import SwipeCard from '@/components/discover/SwipeCard';
import { SAMPLE_DISCOVER_PROFILE } from './samples';

/**
 * Collapsible live-profile demo shown in the hero section.
 *
 * Expanded  → renders the real SwipeCard (same component as the live app).
 * Collapsed → compact pill so the hero copy can occupy the full width.
 *
 * On mobile (<640 px) it defaults to collapsed; on desktop it defaults to expanded.
 */
export default function DiscoverPreview() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    setExpanded(mq.matches);
    const handler = (e: MediaQueryListEvent) => setExpanded(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="w-full flex flex-col items-center">

      {/* ── Collapsed pill ─────────────────────────────────── */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-semibold text-slate-700 hover:border-[#157A6E] hover:text-[#157A6E] transition-all cursor-pointer"
          aria-label="Expand profile demo"
        >
          <span className="w-7 h-7 rounded-full bg-[#157A6E]/10 text-[#157A6E] text-xs font-bold flex items-center justify-center select-none">
            D
          </span>
          <span>See a live profile demo</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* ── Expanded card ──────────────────────────────────── */}
      {expanded && (
        <div className="w-full relative" style={{ maxWidth: 390 }}>
          {/* Collapse control — sits above the card's hero photo */}
          <button
            onClick={() => setExpanded(false)}
            className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer"
            aria-label="Collapse profile demo"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            Collapse demo
          </button>

          {/* Real SwipeCard — same component used in the live app */}
          <div style={{
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <SwipeCard
              profile={SAMPLE_DISCOVER_PROFILE}
              onConnect={async () => {}}
              onSkip={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

