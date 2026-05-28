'use client';

import { useState, useRef } from 'react';
import { CIRCLE_TAGS, type CircleTag, type LinkPreview } from '@/lib/types';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import LinkPreviewCard from './LinkPreviewCard';

type StructuredMeta = {
  looking_for: string; building: string; current_goal: string; open_to: string;
  industry: string; skill_level: string; location: string; timeline: string;
};

type Props = { onClose: () => void; onPosted: () => void; };

function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

export default function ComposePost({ onClose, onPosted }: Props) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [selectedTags, setSelectedTags] = useState<CircleTag[]>([]);
  const [meta, setMeta] = useState<StructuredMeta>({
    looking_for: '', building: '', current_goal: '', open_to: '',
    industry: '', skill_level: '', location: '', timeline: '',
  });
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [fetchingLink, setFetchingLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const words = wordCount(text);
  const canPost = text.trim().length > 0 && selectedTags.length > 0 && words <= 250 && !submitting;

  function toggleTag(tag: CircleTag) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag)
        : prev.length < 3 ? [...prev, tag] : prev
    );
  }

  async function fetchPreview() {
    if (!linkUrl.trim()) return;
    setFetchingLink(true);
    try {
      const data = await apiPost<LinkPreview>('/api/circles/link-preview', { url: linkUrl.trim() });
      setLinkPreview(data);
      setLinkUrl('');
    } catch {
      toast('Could not fetch link preview', 'error');
    } finally {
      setFetchingLink(false);
    }
  }

  async function handleSubmit() {
    if (!canPost) return;
    setSubmitting(true);
    try {
      const cleanMeta = Object.fromEntries(
        Object.entries(meta).filter(([, v]) => v.trim())
      );
      await apiPost('/api/circles/posts', {
        text: text.trim(),
        tags: selectedTags,
        structured_meta: cleanMeta,
        links: linkPreview ? [linkPreview] : [],
      });
      toast('Posted to Circles', 'success');
      onPosted();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to post';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="compose-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compose-sheet">
        <div className="compose-header">
          <span className="compose-title">Share to Circles</span>
          <button className="compose-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="compose-body">
          <textarea
            ref={textareaRef}
            className="compose-textarea"
            placeholder="What are you building, learning, solving, seeking, or progressing toward?"
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
          <div className={`compose-word-count${words > 250 ? ' over' : ''}`}>
            {words}/250 words
          </div>

          {/* Tags */}
          <div className="compose-section-label">Tags <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(pick 1–3)</span></div>
          <div className="compose-tags-grid">
            {CIRCLE_TAGS.map(tag => (
              <button
                key={tag}
                className={`compose-tag-btn${selectedTags.includes(tag) ? ' selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Link attachment */}
          <div className="compose-section-label">Link <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          {!linkPreview ? (
            <div className="compose-link-row">
              <input
                className="compose-link-input"
                placeholder="https://github.com/…"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchPreview(); } }}
              />
              <button
                className="compose-link-fetch-btn"
                onClick={fetchPreview}
                disabled={!linkUrl.trim() || fetchingLink}
              >
                {fetchingLink ? '…' : 'Preview'}
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <LinkPreviewCard preview={linkPreview} />
              <button
                onClick={() => setLinkPreview(null)}
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* Structured metadata (collapsible) */}
          <button
            onClick={() => setShowMeta(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', padding: '10px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showMeta ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
            {showMeta ? 'Hide context' : 'Add structured context'}
          </button>

          {showMeta && (
            <>
              <div className="compose-section-label" style={{ marginTop: 10 }}>Context chips</div>
              <div className="compose-meta-grid">
                {[
                  ['looking_for', 'Looking for…'],
                  ['building', 'Building…'],
                  ['current_goal', 'Current goal…'],
                  ['open_to', 'Open to…'],
                  ['industry', 'Industry…'],
                  ['skill_level', 'Skill level…'],
                  ['location', 'Location…'],
                  ['timeline', 'Timeline…'],
                ].map(([key, ph]) => (
                  <input
                    key={key}
                    className="compose-meta-input"
                    placeholder={ph}
                    value={meta[key as keyof StructuredMeta]}
                    onChange={e => setMeta(m => ({ ...m, [key]: e.target.value }))}
                  />
                ))}
              </div>
            </>
          )}

          <div style={{ height: 16 }} />
        </div>

        <div className="compose-footer">
          <button className="compose-post-btn" onClick={handleSubmit} disabled={!canPost}>
            {submitting ? 'Posting…' : 'Post to Circles'}
          </button>
        </div>
      </div>
    </div>
  );
}
