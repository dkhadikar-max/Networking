'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CIRCLE_TAGS, type CircleTag, type CirclePost } from '@/lib/types';
import { apiGet, apiDelete } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import CirclePostCard from '@/components/circles/CirclePostCard';
import ComposePost from '@/components/circles/ComposePost';
import NotificationBell from '@/components/ui/NotificationBell';

type FeedMode = 'for-you' | 'near-me' | 'all';

const MODES: { key: FeedMode; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'near-me', label: 'Near Me' },
  { key: 'all',     label: 'All' },
];

export default function CirclesPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get('post');
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [activeTag, setActiveTag] = useState<CircleTag | null>(null);
  const [mode, setMode] = useState<FeedMode>(highlightPostId ? 'all' : 'for-you');
  const [noLocation, setNoLocation] = useState(false);
  const [composing, setComposing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasPostsRef = useRef(false);
  useEffect(() => { hasPostsRef.current = posts.length > 0; }, [posts]);

  const fetchPosts = useCallback(async (tag: CircleTag | null, off: number, replace: boolean, feedMode: FeedMode, hadPosts: boolean) => {
    // Only show the full-screen spinner on a genuinely empty feed — a tab/tag
    // switch when posts are already on screen should keep them visible instead
    // of flashing to blank, otherwise every switch reads as "did nothing".
    if (replace) { if (!hadPosts) setLoading(true); setSwitching(hadPosts); setFetchError(false); setNoLocation(false); }
    else { setLoadingMore(true); loadingMoreRef.current = true; }
    try {
      const params = new URLSearchParams({ offset: String(off), limit: '20', mode: feedMode });
      if (tag) params.set('tags', tag);
      const data = await apiGet<{ posts: CirclePost[]; hasMore: boolean; noLocation?: boolean }>(`/api/circles/feed?${params}`);
      if (data.noLocation) { setNoLocation(true); setPosts([]); setHasMore(false); return; }
      setPosts(prev => replace ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setOffset(off + data.posts.length);
    } catch {
      if (replace) setFetchError(true);
      else toast('Failed to load more', 'error');
    } finally {
      setLoading(false);
      setSwitching(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    fetchPosts(activeTag, 0, true, mode, hasPostsRef.current);
  }, [activeTag, mode, fetchPosts]);

  // Bug 2 fix: scroll to the referenced post once the feed has loaded
  useEffect(() => {
    if (!highlightPostId || loading) return;
    const el = document.getElementById(`post-${highlightPostId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightPostId, loading]);

  async function handleDelete(id: string) {
    try {
      await apiDelete(`/api/circles/posts/${id}`);
      setPosts(prev => prev.filter(p => p.id !== id));
      toast('Post deleted', 'success');
    } catch {
      toast('Could not delete post', 'error');
    }
  }

  function handleEdit(id: string, newText: string) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, text: newText } : p));
  }

  function handlePosted() {
    fetchPosts(activeTag, 0, true, mode, hasPostsRef.current);
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!hasMore || loadingMoreRef.current || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      fetchPosts(activeTag, offset, false, mode, hasPostsRef.current);
    }
  }

  return (
    <div className="circles-wrap">
      {/* Header */}
      <div className="circles-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="byn-logo-box-sm" style={{ width: 32, height: 32, borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
              <circle cx="25" cy="25" r="10" fill="#1DB7A6"/>
              <circle cx="75" cy="50" r="16" fill="#1DB7A6"/>
              <circle cx="25" cy="75" r="10" fill="#F4A259"/>
              <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="circles-title">Circles</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
          <button
            onClick={() => setComposing(true)}
            style={{ padding: '7px 14px', borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Post
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="circles-mode-bar" style={{ position: 'relative' }}>
        {MODES.map(m => (
          <button
            key={m.key}
            className={`circles-mode-btn${mode === m.key ? ' active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
        {switching && (
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
        )}
      </div>

      {/* Tag filter bar */}
      <div className="circles-filter-wrap">
        <div className="circles-filter-bar">
          <button
            className={`circles-filter-pill${activeTag === null ? ' active' : ''}`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {CIRCLE_TAGS.map(tag => (
            <button
              key={tag}
              className={`circles-filter-pill${activeTag === tag ? ' active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="circles-feed" onScroll={handleScroll}>
        {loading && (
          <div className="circles-empty">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && fetchError && (
          <div className="circles-empty">
            <div className="circles-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="circles-empty-title">Could not load posts</div>
            <button
              onClick={() => fetchPosts(activeTag, 0, true, mode, false)}
              style={{ padding: '8px 20px', borderRadius: 'var(--r-lg)', background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && noLocation && (
          <div className="circles-empty">
            <div className="circles-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="circles-empty-title">Add your location</div>
            <div className="circles-empty-sub">Update your profile with a city to see posts from people near you.</div>
          </div>
        )}

        {!loading && !fetchError && !noLocation && posts.length === 0 && (
          <div className="circles-empty">
            <div className="circles-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div className="circles-empty-title">
              {activeTag ? `No ${activeTag} posts yet` : mode === 'near-me' ? 'No posts near you yet' : 'No posts yet'}
            </div>
            <div className="circles-empty-sub">
              Be the first to share what you&apos;re building, learning, or seeking.
            </div>
          </div>
        )}

        {!loading && !fetchError && posts.map(post => (
          <div key={post.id} id={`post-${post.id}`}>
            <CirclePostCard post={post} onDelete={handleDelete} onEdit={handleEdit} />
          </div>
        ))}

        {loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && !hasMore && posts.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--muted)' }}>
            You&apos;ve seen it all
          </div>
        )}
      </div>

      {/* Compose sheet */}
      {composing && <ComposePost onClose={() => setComposing(false)} onPosted={handlePosted} />}
    </div>
  );
}
