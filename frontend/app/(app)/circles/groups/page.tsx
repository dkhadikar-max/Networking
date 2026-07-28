'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import CreateGroupModal from '@/components/circles/CreateGroupModal';
import type { CircleGroup } from '@/lib/types';

type Tab = 'discover' | 'mine';

export default function CircleGroupsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const data = await apiGet<{ groups: CircleGroup[] }>(`/api/circle-groups${t === 'mine' ? '?mine=true' : ''}`);
      setGroups(data.groups);
    } catch {
      toast('Failed to load circles', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(tab); }, [tab, load]);

  async function handleJoin(g: CircleGroup) {
    setJoiningId(g.id);
    try {
      await apiPost(`/api/circle-groups/${g.id}/join`, {});
      router.push(`/circles/groups/${g.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to join', 'error');
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className="circles-wrap">
      <div className="circles-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/circles" style={{ color: 'var(--text-soft)', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </Link>
          <span className="circles-title">Circles</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{ padding: '7px 14px', borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Create
        </button>
      </div>

      <div className="circles-mode-bar">
        <button className={`circles-mode-btn${tab === 'discover' ? ' active' : ''}`} onClick={() => setTab('discover')}>
          {tab === 'discover' && <motion.div layoutId="groups-tab-pill" className="circles-mode-pill-bg" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          <span className="circles-mode-btn-label">Discover</span>
        </button>
        <button className={`circles-mode-btn${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
          {tab === 'mine' && <motion.div layoutId="groups-tab-pill" className="circles-mode-pill-bg" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          <span className="circles-mode-btn-label">My Circles</span>
        </button>
      </div>

      <div className="circles-feed">
        {loading && (
          <div className="circles-empty">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="circles-empty">
            <div className="circles-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="circles-empty-title">{tab === 'mine' ? "You haven't joined any circles yet" : 'No circles yet'}</div>
            <div className="circles-empty-sub">
              {tab === 'mine' ? 'Discover a circle or create your own.' : 'Be the first to start one.'}
            </div>
          </div>
        )}

        {!loading && groups.map(g => (
          <div key={g.id} className="circle-post">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{g.name}</span>
                {g.privacy === 'private' && (
                  <span className="circle-tag" style={{ flexShrink: 0 }}>Private</span>
                )}
              </div>
              {g.description && <p style={{ fontSize: 13, color: 'var(--text-soft)', margin: 0 }}>{g.description}</p>}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                {g.my_role === 'admin' && ' · You\'re an admin'}
                {g.my_role === 'member' && ' · You\'re a member'}
              </span>
            </div>
            {!g.my_role && g.privacy === 'public' && (
              <button
                className="circle-collab-btn"
                onClick={() => handleJoin(g)}
                disabled={joiningId === g.id}
                style={{ alignSelf: 'flex-start' }}
              >
                {joiningId === g.id ? 'Joining…' : 'Join'}
              </button>
            )}
            {g.my_role && (
              <button
                className="circle-collab-btn"
                onClick={() => router.push(`/circles/groups/${g.id}`)}
                style={{ alignSelf: 'flex-start' }}
              >
                View
              </button>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {creating && (
          <CreateGroupModal
            onClose={() => setCreating(false)}
            onCreated={(id) => { setCreating(false); router.push(`/circles/groups/${id}`); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
