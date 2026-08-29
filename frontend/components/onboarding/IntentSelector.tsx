'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { IconNetwork, IconCompass, IconRocket, IconTeam, IconBriefcase, IconTarget, IconGraduate, IconBook, IconGlobe, IconTrendUp } from './icons';

const INTENTS = [
  { label: 'Networking',                icon: <IconNetwork />, desc: 'Expand your professional circle' },
  { label: 'Find Opportunities',        icon: <IconCompass />, desc: 'Discover jobs, projects & gigs' },
  { label: 'Build Startup Connections', icon: <IconRocket />,  desc: 'Connect with founders & builders' },
  { label: 'Find Co-founder',           icon: <IconTeam />,    desc: 'Find your perfect business partner' },
  { label: 'Hiring',                    icon: <IconBriefcase />, desc: 'Source talent for your team' },
  { label: 'Find Clients',              icon: <IconTarget />,  desc: 'Grow your customer base' },
  { label: 'Mentorship',                icon: <IconGraduate />, desc: 'Give or receive guidance' },
  { label: 'Learn from People',         icon: <IconBook />,    desc: 'Absorb knowledge from experts' },
  { label: 'Community',                 icon: <IconGlobe />,   desc: 'Be part of something bigger' },
  { label: 'Investment Opportunities',  icon: <IconTrendUp />, desc: 'Find deals or raise capital' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px', marginBottom: 5 }}>
          What brings you here?
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          Select all that apply — we&apos;ll personalise your experience.
        </p>
      </div>

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5">
        {INTENTS.map((intent, i) => {
          const active = selected.has(intent.label);
          return (
            <motion.button
              key={intent.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035 }}
              onClick={() => toggle(intent.label)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '13px 12px', borderRadius: 14, textAlign: 'left',
                border: active ? '2px solid #157A6E' : '1.5px solid #E2E8F0',
                background: active ? 'rgba(21,122,110,0.07)' : '#F8FAFC',
                cursor: 'pointer', transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', marginTop: 1, flexShrink: 0, color: active ? '#157A6E' : '#94A3B8' }}>{intent.icon}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: active ? '#157A6E' : '#0F172A', marginBottom: 2 }}>
                  {intent.label}
                </p>
                <p style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.4 }}>{intent.desc}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={() => onNext([...selected])}
        disabled={selected.size === 0 || loading}
        style={{
          width: '100%', padding: '15px 16px', borderRadius: 12,
          background: '#F4A259', color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 700,
          cursor: selected.size === 0 || loading ? 'not-allowed' : 'pointer',
          opacity: selected.size === 0 || loading ? 0.45 : 1,
          boxShadow: selected.size === 0 || loading ? 'none' : '0 8px 20px rgba(244,162,89,0.3)',
          fontFamily: 'inherit', transition: 'opacity 0.15s',
        }}
      >
        {loading ? 'Saving…' : 'Continue →'}
      </button>
    </div>
  );
}
