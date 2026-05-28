'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CIRCLE_TAGS, type CircleTag, type CirclePost } from '@/lib/types';
import { apiGet, apiDelete } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import CirclePostCard from '@/components/circles/CirclePostCard';
import ComposePost from '@/components/circles/ComposePost';

export default function CirclesPage() {
  const toast = useToast();
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [activeTag, setActiveTag] = useState<CircleTag | null>(null);
  const [composing, setComposing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const loadingMoreRef = useRef(false);

  const fetchPosts = useCallback(async (tag: CircleTag | null, off: number, replace: boolean) => {
    if (replace) { setLoading(true); setFetchError(false); } else { setLoadingMore(true); loadingMoreRef.current = true; }
    try {
      const params = new URLSearchParams({ offset: String(off), limit: '20' });
      if (tag) params.set('tags', tag);
      const data = await apiGet<{ posts: CirclePost[]; hasMore: boolean }>(`/api/circles/feed?${params}`);
      setPosts(prev => replace ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setOffset(off + data.posts.length);
    } catch {
      if (replace) setFetchError(true);
      else toast('Failed to load more', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    fetchPosts(activeTag, 0, true);
  }, [activeTag, fetchPosts]);

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
    fetchPosts(activeTag, 0, true);
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!hasMore || loadingMoreRef.current || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      fetchPosts(activeTag, offset, false);
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
        <button
          onClick={() => setComposing(true)}
          style={{ padding: '7px 14px', borderRadius: 'var(--r-lg)', background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Post
        </button>
      </div>

      {/* Tag filter bar */}
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
              onClick={() => fetchPosts(activeTag, 0, true)}
              style={{ padding: '8px 20px', borderRadius: 'var(--r-lg)', background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && posts.length === 0 && (
          <div className="circles-empty">
            <div className="circles-empty-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div className="circles-empty-title">
              {activeTag ? `No ${activeTag} posts yet` : 'No posts yet'}
            </div>
            <div className="circles-empty-sub">
              Be the first to share what you&apos;re building, learning, or seeking.
            </div>
          </div>
        )}

        {!loading && !fetchError && posts.map(post => (
          <CirclePostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} />
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
