'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  function close() { setOpen(false); setDone(false); }

  return (
    <>
      <button className="feedback-tab" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Feedback</span>
      </button>

      {open && (
        <>
          <div className="feedback-overlay" onClick={close} />
          <div className="feedback-modal">
            <div className="feedback-header">
              <h3>Share Your Thoughts</h3>
              <button className="feedback-close" onClick={close}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="feedback-body">
              {done ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="success-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
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
                  try { await apiPost('/api/feedback', { category, message }); } catch {}
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
                    <input type="email" placeholder="you@example.com" />
                    <span className="field-hint">Only if you&apos;d like us to follow up</span>
                  </div>
                  <button type="submit" className="feedback-submit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
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
