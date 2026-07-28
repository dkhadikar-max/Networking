'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPatch, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
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
  if (!author) return null; // author account no longer exists — post is filtered upstream, this is defense in depth
  const initials = author.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const photo = author.photos?.[0];
  const metaEntries = Object.entries(structured_meta || {}).filter(([, v]) => v && String(v).trim());
  const isOwn = user?.id === post.user_id;
  const canEdit = isOwn && (Date.now() - new Date(created_at).getTime()) < 30 * 60 * 1000;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [saving, setSaving] = useState(false);
  const [showCollaborate, setShowCollaborate] = useState(false);

  const editWords = wordCount(editText);

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
      {/* Author row */}
      <div className="circle-post-author">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className="circle-post-avatar"
          onClick={() => router.push(`/profile/${author.id}`)}
          style={{ cursor: 'pointer' }}
        >
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt={author.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : initials}
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div className="circle-post-identity" style={{ cursor: 'pointer' }} onClick={() => router.push(`/profile/${author.id}`)}>
          <div className="circle-post-name">{author.name}</div>
          <div className="circle-post-meta">
            <span className="circle-trust">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--primary)" style={{ flexShrink: 0 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {author.trust_score}
            </span>
            {author.intent && (
              <span className="circle-intent-badge">· {author.intent.replace(/-/g, ' ')}</span>
            )}
            {isActive(author.last_active) && (
              <span className="momentum-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M13 2 3 14h9l-1 8 10-12h-9z"/>
                </svg>
                Active
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className="circle-post-time">{timeAgo(created_at)}</span>
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

      {/* Body or inline edit */}
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
        <p className="circle-post-body">{text}</p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="circle-tags">
          {tags.map(tag => <span key={tag} className="circle-tag">{tag}</span>)}
        </div>
      )}

      {/* Structured metadata chips */}
      {metaEntries.length > 0 && (
        <div className="circle-meta-chips">
          {metaEntries.map(([key, val]) => (
            <span key={key} className="circle-chip">
              <strong>{META_LABELS[key] ?? key}:</strong> {String(val)}
            </span>
          ))}
        </div>
      )}

      {/* Link previews */}
      {links.map((lp, i) => (
        <LinkPreviewCard key={lp.url || i} preview={lp} />
      ))}

      {/* Collaborate — non-own posts only */}
      {!isOwn && (
        <button className="circle-collab-btn" onClick={() => { apiPost(`/api/circles/posts/${post.id}/collaborate`, {}).catch(e => toast(e instanceof Error ? e.message : 'Could not send collaborate signal', 'error')); setShowCollaborate(true); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Collaborate
        </button>
      )}

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
