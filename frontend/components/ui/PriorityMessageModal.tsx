/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { formatDistanceToNow } from 'date-fns';
import type { PriorityMessagesResponse } from '@/lib/types';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: 'inbox' | 'compose';
  targetId?: string;
  targetName?: string;
};

const MAX_CHARS = 500;

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ''; }
}

function SenderAvatar({ name, photo }: { name?: string; photo?: string }) {
  const n = name ?? '?';
  const inits = n.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent, #F4A259)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'white', fontWeight: 700, fontSize: 15 }}>
      {photo ? <img src={photo} alt={n} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : inits}
    </div>
  );
}

export default function PriorityMessageModal({ open, onClose, mode, targetId, targetName }: Props) {
  const toast = useToast();
  const [data, setData] = useState<PriorityMessagesResponse | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingInbox(true);
    apiGet<PriorityMessagesResponse>('/api/priority-messages')
      .then(r => setData(r))
      .catch(() => toast('Failed to load priority messages', 'error'))
      .finally(() => setLoadingInbox(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!targetId || !text.trim() || sending) return;
    setSending(true);
    try {
      const res = await apiPost<{ ok: boolean; remaining: number }>('/api/priority-message', { targetId, text: text.trim() });
      toast('Priority message sent!', 'success');
      setText('');
      if (data) setData({ ...data, remaining: res.remaining });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const received = data?.received ?? [];
  const limit = data?.limit ?? (data ? data.limit : null);
  const remaining = data?.remaining ?? null;
  const used = (limit != null && remaining != null) ? limit - remaining : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: '24px 24px 0 0', padding: '16px 20px 32px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 18px', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <span style={{ fontSize: 18, marginRight: 8 }}>⚡</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, margin: 0, color: 'var(--text)' }}>
            {mode === 'inbox' ? 'Priority Inbox' : `Message ${targetName ?? ''}`}
          </h2>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 8px', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {mode === 'inbox' ? (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loadingInbox ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <div className="spinner" />
              </div>
            ) : received.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                <p style={{ fontSize: 14 }}>No priority messages yet</p>
              </div>
            ) : (
              received.map(msg => (
                <div key={msg.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <SenderAvatar name={msg.sender?.name} photo={msg.sender?.photos?.[0]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ⚡ {msg.sender?.name ?? 'Unknown'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(msg.created_at)}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5, margin: 0 }}>{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            {used != null && limit != null && (
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '16px 0 0' }}>
                {used} / {limit} priority messages used this month
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
              placeholder={`Send a priority message to ${targetName ?? 'this person'}…`}
              rows={5}
              style={{
                width: '100%', resize: 'none', borderRadius: 12,
                border: '1.5px solid var(--border)', padding: '12px 14px',
                fontSize: 14, fontFamily: 'inherit', lineHeight: 1.55,
                outline: 'none', boxSizing: 'border-box', color: 'var(--text)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: text.length >= MAX_CHARS ? 'var(--accent)' : 'var(--muted)' }}>
                {text.length}/{MAX_CHARS}
              </span>
              {used != null && limit != null && (
                <span style={{ fontSize: 12, color: remaining === 0 ? 'var(--accent)' : 'var(--muted)' }}>
                  {used} / {limit} used this month
                </span>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending || remaining === 0}
              style={{
                padding: '13px', borderRadius: 12,
                background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'white', border: 'none', fontSize: 14, fontWeight: 700,
                cursor: !text.trim() || sending || remaining === 0 ? 'not-allowed' : 'pointer',
                opacity: !text.trim() || sending || remaining === 0 ? 0.55 : 1,
                fontFamily: 'inherit', transition: 'opacity 0.15s',
              }}
            >
              {sending ? 'Sending…' : remaining === 0 ? 'Monthly quota reached' : '⚡ Send Priority Message'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
