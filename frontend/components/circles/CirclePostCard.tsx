'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPatch, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import Avatar from '@/components/ui/Avatar';
import { formatIntent } from '@/lib/intent';
import type { CirclePost } from '@/lib/types';
import LinkPreviewCard from './LinkPreviewCard';

const META_LABELS: Record<string, string> = {
  looking_for: 'Looking for',
  building: 'Building',
  current_goal: 'Goal',
  open_to: 'Open to',
  industry: 'Industry',
  skill_level: 'Skill level',
  location: 'Location',
  timeline: 'Timeline',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isActive(lastActive?: string): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 24 * 3600 * 1000;
}

function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

type Props = {
  post: CirclePost;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
};

export default function CirclePostCard({ post, onDelete, onEdit }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { author, text, tags, structured_meta, links, created_at } = post;
  if (!author) return null;

  const photo = author.photos?.[0];
  const isOwn = user?.id === post.user_id;
  const canEdit = isOwn && (Date.now() - new Date(created_at).getTime()) < 30 * 60 * 1000;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [saving, setSaving] = useState(false);
  const [showCollaborate, setShowCollaborate] = useState(false);
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [liking, setLiking] = useState(false);

  const editWords = wordCount(editText);

  // Filter structured meta into prominent primary cards and compact secondary tags
  const buildingText = structured_meta?.building || structured_meta?.current_goal;
  const lookingForText = structured_meta?.looking_for || structured_meta?.open_to;
  const secondaryMetaEntries = Object.entries(structured_meta || {}).filter(
    ([k, v]) => v && String(v).trim() && !['building', 'current_goal', 'looking_for', 'open_to'].includes(k)
  );

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    try {
      const res = await apiPost<{ liked: boolean; likeCount: number }>(`/api/circles/posts/${post.id}/like`, {});
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch (e) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast(e instanceof Error ? e.message : 'Failed to like post', 'error');
    } finally {
      setLiking(false);
    }
  }

  async function handleCollaborateClick() {
    try {
      await apiPost(`/api/circles/posts/${post.id}/collaborate`, {});
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send collaborate signal', 'error');
    }
    setShowCollaborate(true);
  }

  async function handleSave() {
    if (!editText.trim() || editWords > 250 || saving) return;
    setSaving(true);
    try {
      await apiPatch(`/api/circles/posts/${post.id}`, { text: editText.trim() });
      onEdit?.(post.id, editText.trim());
      setIsEditing(false);
      toast('Post updated', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditText(text);
  }

  return (
    <div className="circle-post">
      {/* Author Row */}
      <div className="circle-post-author">
        <div
          className="cursor-pointer shrink-0"
          onClick={() => router.push(`/profile/${author.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') router.push(`/profile/${author.id}`); }}
        >
          <Avatar src={photo} name={author.name} size={42} />
        </div>

        <div
          className="circle-post-identity cursor-pointer"
          onClick={() => router.push(`/profile/${author.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') router.push(`/profile/${author.id}`); }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-display font-bold text-slate-900 text-sm sm:text-base leading-tight">
              {author.name}
            </span>
            {author.verification?.status === 'verified' && (
              <span
                className="w-4 h-4 rounded-full bg-[#157A6E] text-white flex items-center justify-center text-[9px] font-extrabold shrink-0 border border-white"
                title="Verified Builder"
              >
                ✓
              </span>
            )}
            {author.trust_score != null && (
              <span className="text-[10px] font-extrabold text-[#0E5E55] bg-[#CCFBF1] px-2 py-0.5 rounded-full border border-[#157A6E]/20 tabular-nums shrink-0">
                Trust {author.trust_score}
              </span>
            )}
          </div>

          <div className="circle-post-meta">
            {author.headline ? (
              <span className="text-xs text-slate-500 font-medium truncate max-w-[220px] sm:max-w-none">
                {author.headline}
              </span>
            ) : author.intent ? (
              <span className="circle-intent-badge">{formatIntent(author.intent)}</span>
            ) : null}
            {isActive(author.last_active) && (
              <span className="momentum-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M13 2 3 14h9l-1 8 10-12h-9z"/>
                </svg>
                Active recently
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <span className="circle-post-time tabular-nums">{timeAgo(created_at)}</span>
          {canEdit && !isEditing && (
            <button
              className="circle-post-action-btn"
              title="Edit post"
              onClick={() => setIsEditing(true)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {isOwn && onDelete && !isEditing && (
            <button
              className="circle-post-action-btn circle-post-delete"
              title="Delete post"
              onClick={() => onDelete(post.id)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Post Text or Inline Edit */}
      {isEditing ? (
        <div>
          <textarea
            className="circle-edit-textarea"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            autoFocus
          />
          <div className="circle-edit-actions">
            <span className={`compose-word-count${editWords > 250 ? ' over' : ''}`} style={{ fontSize: 11 }}>
              {editWords}/250 words
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="circle-edit-cancel" onClick={handleCancelEdit}>Cancel</button>
              <button
                className="circle-edit-save"
                onClick={handleSave}
                disabled={!editText.trim() || editWords > 250 || saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="circle-post-body text-slate-900 text-sm sm:text-[14.5px] leading-relaxed [overflow-wrap:anywhere] break-words">
          {text}
        </p>
      )}

      {/* Prominent Context Blocks */}
      {(buildingText || lookingForText) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {buildingText && (
            <div className="p-3 rounded-xl bg-[#CCFBF1]/50 border border-[#157A6E]/30 text-[#064E4E] shadow-2xs">
              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#064E4E] mb-1">
                <span>🚀</span> Building
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug [overflow-wrap:anywhere] break-words">
                {buildingText}
              </p>
            </div>
          )}
          {lookingForText && (
            <div className="p-3 rounded-xl bg-[#FFF4E7] border border-[#F4A259]/40 text-[#92400E] shadow-2xs">
              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#92400E] mb-1">
                <span>🤝</span> Looking For
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug [overflow-wrap:anywhere] break-words">
                {lookingForText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Secondary Structured Context Chips */}
      {secondaryMetaEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {secondaryMetaEntries.map(([key, val]) => (
            <span key={key} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-700">
              <strong className="font-bold text-slate-900">{META_LABELS[key] ?? key}:</strong> {String(val)}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="text-[11px] font-bold text-[#157A6E] bg-[#CCFBF1]/60 border border-[#157A6E]/20 px-2.5 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Link Previews */}
      {links.map((lp, i) => (
        <LinkPreviewCard key={lp.url || i} preview={lp} />
      ))}

      {/* Action Row */}
      <div className="circle-actions-row pt-1 flex items-center gap-2">
        {!isOwn && (
          <button
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-gradient-to-r from-[#157A6E] via-[#0E5E55] to-[#1DB7A6] text-white font-extrabold text-xs sm:text-sm shadow-xs hover:shadow-md hover:opacity-95 active:scale-95 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            onClick={handleCollaborateClick}
            title="Send collaboration priority message"
          >
            <span>⚡</span>
            <span>Collaborate</span>
          </button>
        )}

        {!isOwn && (
          <button
            className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              liked
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            onClick={handleLike}
            disabled={liking}
            title="Like post"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span className="tabular-nums">{likeCount > 0 ? likeCount : 'Like'}</span>
          </button>
        )}

        {isOwn && likeCount > 0 && (
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <span className="text-rose-500">❤️</span>
            <span className="tabular-nums">{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
          </span>
        )}
      </div>

      {showCollaborate && (
        <PriorityMessageModal
          open={showCollaborate}
          onClose={() => setShowCollaborate(false)}
          mode="compose"
          targetId={post.user_id}
          targetName={author.name}
        />
      )}
    </div>
  );
}
