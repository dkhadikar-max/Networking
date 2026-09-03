'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';
import {
  IconFeedback,
  IconClose,
  IconSuccess,
  IconSend,
} from '@/components/ui/BynIcons';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  function close() { setOpen(false); setDone(false); }

  return (
    <>
      <button className="feedback-tab" onClick={() => setOpen(true)}>
        <IconFeedback size={18} strokeWidth={2.2} />
        <span>Feedback</span>
      </button>

      {open && (
        <>
          <div className="feedback-overlay" onClick={close} />
          <div className="feedback-modal">
            <div className="feedback-header">
              <h3>Share Your Thoughts</h3>
              <button className="feedback-close" onClick={close}>
                <IconClose size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="feedback-body">
              {done ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="success-icon flex items-center justify-center">
                    <IconSuccess size={32} strokeWidth={2.2} />
                  </div>
                  <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: 'var(--text)' }}>Thank You</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>Your feedback has been received. We review every submission personally.</p>
                  <button className="feedback-done" onClick={close}>Close</button>
                </div>
              ) : (
                <form onSubmit={async e => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const category = (form.elements.namedItem('category') as HTMLSelectElement).value;
                  const message = (form.elements.namedItem('message') as HTMLTextAreaElement).value;
                  const emailInput = form.elements.namedItem('email') as HTMLInputElement | null;
                  const email = emailInput?.value?.trim() || undefined;
                  try { await apiPost('/api/feedback', { category, message, ...(email ? { email } : {}) }); } catch {}
                  setDone(true);
                }}>
                  <p className="feedback-intro">Help us improve Build Your Network. Your feedback shapes the product.</p>
                  <div className="feedback-field">
                    <label>What is this about?</label>
                    <select name="category" defaultValue="" required>
                      <option value="" disabled>Select a topic</option>
                      <option value="bug">Bug or issue</option>
                      <option value="feature">Feature request</option>
                      <option value="ux">User experience</option>
                      <option value="install">Installation problem</option>
                      <option value="other">Something else</option>
                    </select>
                  </div>
                  <div className="feedback-field">
                    <label>Your feedback</label>
                    <textarea name="message" rows={5} required placeholder="Describe what you experienced, what you expected, and what happened instead..." />
                  </div>
                  <div className="feedback-field">
                    <label>Email (optional)</label>
                    <input type="email" name="email" placeholder="you@example.com" />
                    <span className="field-hint">Only if you&apos;d like us to follow up</span>
                  </div>
                  <button type="submit" className="feedback-submit">
                    <IconSend size={16} strokeWidth={2} />
                    Send Feedback
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
