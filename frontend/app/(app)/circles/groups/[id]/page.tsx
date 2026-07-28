'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import CirclePostCard from '@/components/circles/CirclePostCard';
import ComposePost from '@/components/circles/ComposePost';
import GroupMembersPanel from '@/components/circles/GroupMembersPanel';
import type { CircleGroup, CirclePost } from '@/lib/types';

export default function CircleGroupDetailPage() {
  const params = useParams();
  const groupId = String(params.id);
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [group, setGroup] = useState<CircleGroup | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [composing, setComposing] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [joining, setJoining] = useState(false);
  const loadingMoreRef = useRef(false);

  const loadGroup = useCallback(async () => {
    try {
      const data = await apiGet<CircleGroup>(`/api/circle-groups/${groupId}`);
      setGroup(data);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Circle not found');
    }
  }, [groupId]);

  const loadPosts = useCallback(async (off: number, replace: boolean) => {
    if (replace) setLoading(true); else { setLoadingMore(true); loadingMoreRef.current = true; }
    try {
      const data = await apiGet<{ posts: CirclePost[]; hasMore: boolean }>(`/api/circles/feed?group_id=${groupId}&offset=${off}&limit=20`);
      setPosts(prev => replace ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setOffset(off + data.posts.length);
    } catch {
      if (replace) toast('Failed to load posts', 'error');
    } finally {
      setLoading(false); setLoadingMore(false); loadingMoreRef.current = false;
    }
  }, [groupId, toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadGroup(); }, [loadGroup]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (group) loadPosts(0, true); }, [group, loadPosts]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!hasMore || loadingMoreRef.current || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadPosts(offset, false);
  }

  async function handleJoin() {
    setJoining(true);
    try {
      await apiPost(`/api/circle-groups/${groupId}/join`, {});
      await loadGroup();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to join', 'error');
    } finally {
      setJoining(false);
    }
  }

  function handleDelete(id: string) { setPosts(prev => prev.filter(p => p.id !== id)); }
  function handleEdit(id: string, newText: string) { setPosts(prev => prev.map(p => p.id === id ? { ...p, text: newText } : p)); }

  if (groupError) {
    return (
      <div className="circles-wrap">
        <div className="circles-header">
          <Link href="/circles/groups" style={{ color: 'var(--text-soft)', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </Link>
          <span className="circles-title">Circles</span>
        </div>
        <div className="circles-empty">
          <div className="circles-empty-title">{groupError}</div>
        </div>
      </div>
    );
  }

  const isMember = !!group?.my_role;
  const isAdmin = group?.my_role === 'admin';

  return (
    <div className="circles-wrap">
      <div className="circles-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Link href="/circles/groups" style={{ color: 'var(--text-soft)', display: 'flex', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </Link>
          <span className="circles-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group?.name ?? 'Loading…'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isMember && (
            <button onClick={() => setShowMembers(true)} className="circles-mode-btn" style={{ flex: 'none', padding: '6px 12px' }}>
              {group?.member_count} {group?.member_count === 1 ? 'member' : 'members'}
            </button>
          )}
          {isMember && (
            <button
              onClick={() => setComposing(true)}
              style={{ padding: '7px 14px', borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Post
            </button>
          )}
        </div>
      </div>

      {group?.description && (
        <div style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-soft)', borderBottom: '1px solid rgba(226,232,240,0.4)' }}>
          {group.description}
        </div>
      )}

      {!isMember && group && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(226,232,240,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{group.member_count} {group.member_count === 1 ? 'member' : 'members'} · Join to post</span>
          <button
            className="profile-action-btn profile-action-primary"
            style={{ flex: 'none', padding: '9px 18px' }}
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? 'Joining…' : 'Join circle'}
          </button>
        </div>
      )}

      <div className="circles-feed" onScroll={handleScroll}>
        {loading && (
          <div className="circles-empty">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}
        {!loading && posts.length === 0 && (
          <div className="circles-empty">
            <div className="circles-empty-title">No posts yet</div>
            <div className="circles-empty-sub">{isMember ? 'Be the first to share something here.' : 'Join to be the first to post.'}</div>
          </div>
        )}
        {!loading && posts.filter(p => p.author).map(post => (
          <CirclePostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} />
        ))}
        {loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}
        {!loading && !hasMore && posts.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--muted)' }}>You&apos;ve seen it all</div>
        )}
      </div>

      <AnimatePresence>
        {composing && (
          <ComposePost
            onClose={() => setComposing(false)}
            onPosted={() => loadPosts(0, true)}
            groupId={groupId}
            groupName={group?.name}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMembers && group && (
          <GroupMembersPanel
            groupId={groupId}
            groupName={group.name}
            isAdmin={isAdmin}
            isCreator={(uid) => uid === group.creator_id}
            myUserId={user?.id}
            onClose={() => setShowMembers(false)}
            onLeft={() => { setShowMembers(false); router.push('/circles/groups'); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
