'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
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

type Props = {
  post: CirclePost;
  onDelete?: (id: string) => void;
};

export default function CirclePostCard({ post, onDelete }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const { author, text, tags, structured_meta, links, created_at } = post;
  const initials = author.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const photo = author.photos?.[0];
  const metaEntries = Object.entries(structured_meta || {}).filter(([, v]) => v && String(v).trim());
  const isOwn = user?.id === post.user_id;

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
        <div className="circle-post-identity" style={{ cursor: 'pointer' }} onClick={() => router.push(`/profile/${author.id}`)}>
          <div className="circle-post-name">{author.name}</div>
          <div className="circle-post-meta">
            <span className="circle-trust">⭐ {author.trust_score}</span>
            {author.intent && (
              <span className="circle-intent-badge">· {author.intent.replace(/-/g, ' ')}</span>
            )}
            {isActive(author.last_active) && (
              <span className="momentum-badge">🔥 Active</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className="circle-post-time">{timeAgo(created_at)}</span>
          {isOwn && onDelete && (
            <button
              className="circle-post-delete"
              title="Delete post"
              onClick={() => onDelete(post.id)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <p className="circle-post-body">{text}</p>

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
    </div>
  );
}
