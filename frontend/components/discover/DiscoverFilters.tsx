'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type FilterState = {
  sort: 'relevance' | 'recent';
  intents: string[];   // up to 3; empty = no filter
  location: 'nearby' | 'remote' | 'worldwide';
};

export const DEFAULT_FILTERS: FilterState = {
  sort: 'relevance',
  intents: [],
  location: 'nearby',
};

const INTENTS = ['Hiring', 'Freelance', 'Co-founder', 'Mentorship', 'Investing', 'Networking'];

type Props = {
  open: boolean;
  current: FilterState;
  onApply: (f: FilterState) => void;
  onClose: () => void;
};

function chip(label: string, active: boolean, onClick: () => void) {
  return (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500,
        cursor: 'pointer', border: '1.5px solid', fontFamily: 'inherit',
        background: active ? 'var(--light)' : 'var(--sur2)',
        color: active ? 'var(--primary)' : 'var(--sub)',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.sort !== 'relevance') n++;
  if (f.intents.length > 0) n += f.intents.length;
  if (f.location !== 'nearby') n++;
  return n;
}

const MAX_INTENTS = 3;

export default function DiscoverFilters({ open, current, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<FilterState>(current);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open) setDraft(current); }, [open]);

  function reset() { setDraft(DEFAULT_FILTERS); }

  function toggleIntent(val: string) {
    setDraft(d => {
      if (d.intents.includes(val)) return { ...d, intents: d.intents.filter(i => i !== val) };
      if (d.intents.length >= MAX_INTENTS) return d; // cap at 3
      return { ...d, intents: [...d.intents, val] };
    });
  }

  const intentHint = draft.intents.length === 0
    ? 'Select up to 3'
    : draft.intents.length === 1
      ? '1 of 3 — add up to 2 more to broaden'
      : `${draft.intents.length} selected`;

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: '24px 24px 0 0', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Filters</span>
          <button
            onClick={reset}
            style={{ fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
          >
            Reset
          </button>
        </div>

        {/* Sort */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 10 }}>Sort By</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chip('Match Score', draft.sort === 'relevance', () => setDraft(d => ({ ...d, sort: 'relevance' })))}
            {chip('Recent', draft.sort === 'recent', () => setDraft(d => ({ ...d, sort: 'recent' })))}
          </div>
        </div>

        {/* Intent — multi-select up to 3 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Intent</div>
            <span style={{ fontSize: 11, color: draft.intents.length >= MAX_INTENTS ? 'var(--accent)' : 'var(--muted)' }}>{intentHint}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTENTS.map(i => chip(
              i,
              draft.intents.includes(i),
              () => toggleIntent(i),
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 10 }}>Location</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chip('Nearby', draft.location === 'nearby', () => setDraft(d => ({ ...d, location: 'nearby' })))}
            {chip('Remote', draft.location === 'remote', () => setDraft(d => ({ ...d, location: 'remote' })))}
            {chip('Worldwide', draft.location === 'worldwide', () => setDraft(d => ({ ...d, location: 'worldwide' })))}
          </div>
        </div>

        {/* Apply */}
        <button
          onClick={() => { onApply(draft); onClose(); }}
          style={{
            padding: '14px', borderRadius: 14,
            background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
            color: 'white', border: 'none', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Show Matches
        </button>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
