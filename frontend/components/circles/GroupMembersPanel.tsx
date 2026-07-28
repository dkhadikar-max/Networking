'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import type { CircleGroupMember } from '@/lib/types';

type Props = {
  groupId: string;
  groupName: string;
  isAdmin: boolean;
  isCreator: (userId: string) => boolean;
  myUserId?: string;
  onClose: () => void;
  onLeft: () => void;
};

export default function GroupMembersPanel({ groupId, groupName, isAdmin, isCreator, myUserId, onClose, onLeft }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [members, setMembers] = useState<CircleGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ members: CircleGroupMember[] }>(`/api/circle-groups/${groupId}/members`);
      setMembers(data.members);
    } catch {
      toast('Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function act(userId: string, action: 'promote' | 'demote' | 'remove') {
    setBusyId(userId);
    try {
      await apiPost(`/api/circle-groups/${groupId}/members/${userId}/${action}`, {});
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : `Failed to ${action}`, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeave() {
    setBusyId('__leave__');
    try {
      await apiPost(`/api/circle-groups/${groupId}/leave`, {});
      toast('Left circle', 'success');
      onLeft();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to leave', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    setBusyId('__delete__');
    try {
      await apiDelete(`/api/circle-groups/${groupId}`);
      toast('Circle deleted', 'success');
      onLeft();
      router.push('/circles/groups');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <motion.div
      className="compose-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="compose-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
      >
        <div className="compose-header">
          <span className="compose-title">{groupName} · Members</span>
          <button className="compose-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="compose-body">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            </div>
          )}
          {!loading && members.map(m => m.user && (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--sur2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                {m.user.photos?.[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.user.photos[0]} alt={m.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : m.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {m.user.name}{m.user_id === myUserId && ' (you)'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {m.role === 'admin' ? 'Admin' : 'Member'}{isCreator(m.user_id) && ' · Creator'}
                </div>
              </div>
              {isAdmin && m.user_id !== myUserId && !isCreator(m.user_id) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.role === 'member' ? (
                    <button className="circle-edit-cancel" disabled={busyId === m.user_id} onClick={() => act(m.user_id, 'promote')}>
                      Make admin
                    </button>
                  ) : (
                    <button className="circle-edit-cancel" disabled={busyId === m.user_id} onClick={() => act(m.user_id, 'demote')}>
                      Remove admin
                    </button>
                  )}
                  <button className="circle-post-delete" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', background: 'none', cursor: 'pointer' }} disabled={busyId === m.user_id} onClick={() => act(m.user_id, 'remove')}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="compose-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {myUserId && isCreator(myUserId) ? (
            <button className="circle-post-delete" style={{ border: '1.5px solid var(--danger)', borderRadius: 12, padding: '11px', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }} disabled={busyId === '__delete__'} onClick={handleDelete}>
              {busyId === '__delete__' ? 'Deleting…' : 'Delete circle'}
            </button>
          ) : (
            <button className="circle-post-delete" style={{ border: '1.5px solid var(--danger)', borderRadius: 12, padding: '11px', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }} disabled={busyId === '__leave__'} onClick={handleLeave}>
              {busyId === '__leave__' ? 'Leaving…' : 'Leave circle'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
