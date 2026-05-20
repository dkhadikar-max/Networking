'use client';

import { useState } from 'react';
import { apiPut, apiUpload } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import type { User } from '@/lib/types';

type Props = {
  user: User;
  onSave: (updated: User) => void;
  onCancel: () => void;
};

const INTENT_OPTIONS = ['Hiring', 'Job hunting', 'Fundraising', 'Investing', 'Collaborating', 'Learning', 'Mentoring', 'Being mentored'];

export default function ProfileEdit({ user, onSave, onCancel }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: user.name ?? '',
    headline: user.headline ?? '',
    bio: user.bio ?? '',
    location: user.location ?? '',
    current_role: user.current_role ?? '',
    working_on: user.working_on ?? '',
    currently_exploring: user.currently_exploring ?? '',
    linkedin: user.linkedin ?? '',
    website: user.website ?? '',
    instagram: user.instagram ?? '',
    intent: user.intent ?? '',
    interests: (user.interests ?? []).join(', '),
    skills: (user.skills ?? []).join(', '),
  });

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await apiUpload('/api/profile/photo', fd);
      toast('Photo uploaded', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally { setUploading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
        skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
      };
      const updated = await apiPut<User>('/api/profile', payload);
      toast('Profile saved', 'success');
      onSave(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';
  const labelCls = 'block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5';

  return (
    <div className="flex-1 overflow-y-auto">
      <form onSubmit={handleSave} className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text)]">Edit profile</h1>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </div>

        {/* Photo upload */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5">
          <label className={labelCls}>Profile photo</label>
          <div className="flex items-center gap-4">
            <Avatar src={user.photos?.[0]} name={user.name} size={64} />
            <label className="cursor-pointer">
              <span className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors inline-block">
                {uploading ? 'Uploading…' : 'Upload photo'}
              </span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Basic info */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Basic info</h2>
          <div>
            <label className={labelCls}>Full name</label>
            <input type="text" value={form.name} onChange={field('name')} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Headline</label>
            <input type="text" value={form.headline} onChange={field('headline')} placeholder="e.g. Founder & CEO at Acme" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Current role</label>
            <input type="text" value={form.current_role} onChange={field('current_role')} placeholder="e.g. Product Manager" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input type="text" value={form.location} onChange={field('location')} placeholder="e.g. Bengaluru, India" className={inputCls} />
          </div>
        </div>

        {/* About */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">About you</h2>
          <div>
            <label className={labelCls}>Bio</label>
            <textarea rows={3} value={form.bio} onChange={field('bio')} placeholder="Tell people about yourself" className={inputCls + ' resize-none'} />
          </div>
          <div>
            <label className={labelCls}>Working on</label>
            <textarea rows={2} value={form.working_on} onChange={field('working_on')} placeholder="What are you building?" className={inputCls + ' resize-none'} />
          </div>
          <div>
            <label className={labelCls}>Currently exploring</label>
            <textarea rows={2} value={form.currently_exploring} onChange={field('currently_exploring')} placeholder="What are you curious about?" className={inputCls + ' resize-none'} />
          </div>
        </div>

        {/* Intent */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Networking intent</h2>
          <div className="flex flex-wrap gap-2">
            {INTENT_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, intent: opt }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  form.intent === opt
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-white text-[var(--sub)] border-[var(--border)] hover:border-[var(--primary)]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Interests & skills */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Interests &amp; skills</h2>
          <div>
            <label className={labelCls}>Interests (comma-separated)</label>
            <input type="text" value={form.interests} onChange={field('interests')} placeholder="AI, Climate, Design…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Skills (comma-separated)</label>
            <input type="text" value={form.skills} onChange={field('skills')} placeholder="React, Marketing, Finance…" className={inputCls} />
          </div>
        </div>

        {/* Social links */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Links</h2>
          <div>
            <label className={labelCls}>LinkedIn URL</label>
            <input type="url" value={form.linkedin} onChange={field('linkedin')} placeholder="https://linkedin.com/in/…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input type="url" value={form.website} onChange={field('website')} placeholder="https://yoursite.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Instagram handle</label>
            <input type="text" value={form.instagram} onChange={field('instagram')} placeholder="yourhandle" className={inputCls} />
          </div>
        </div>

        <div className="pb-24 lg:pb-4">
          <Button type="submit" loading={saving} fullWidth>Save changes</Button>
        </div>
      </form>
    </div>
  );
}
