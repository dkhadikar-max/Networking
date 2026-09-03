'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { IconClose } from '@/components/ui/BynIcons';

type Props = { onClose: () => void; onCreated: (id: string) => void };

export default function CreateGroupModal({ onClose, onCreated }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit = name.trim().length > 0 && name.trim().length <= 60 && description.length <= 300 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await apiPost<{ ok: boolean; id: string }>('/api/circle-groups', {
        name: name.trim(), description: description.trim() || undefined, privacy,
      });
      toast('Circle created', 'success');
      onCreated(res.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create circle', 'error');
    } finally {
      setSubmitting(false);
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
          <span className="compose-title">Create a circle</span>
          <button className="compose-close" onClick={onClose}>
            <IconClose size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="compose-body">
          <div className="compose-section-label">Name</div>
          <input
            className="compose-link-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder="e.g. Bangalore Founders"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
          <div className={`compose-word-count${name.length > 60 ? ' over' : ''}`}>{name.length}/60</div>

          <div className="compose-section-label" style={{ marginTop: 10 }}>
            Description <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
          </div>
          <textarea
            className="compose-textarea"
            style={{ minHeight: 70 }}
            placeholder="What's this circle for?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={300}
          />
          <div className={`compose-word-count${description.length > 300 ? ' over' : ''}`}>{description.length}/300</div>

          <div className="compose-section-label" style={{ marginTop: 10 }}>Privacy</div>
          <div className="compose-tags-grid">
            <button
              className={`compose-tag-btn${privacy === 'public' ? ' selected' : ''}`}
              onClick={() => setPrivacy('public')}
            >
              Public — anyone can join
            </button>
            <button
              className={`compose-tag-btn${privacy === 'private' ? ' selected' : ''}`}
              onClick={() => setPrivacy('private')}
            >
              Private — invite only
            </button>
          </div>

          <div style={{ height: 16 }} />
        </div>

        <div className="compose-footer" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <button className="compose-post-btn" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create circle'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
