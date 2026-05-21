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

const INTENT_OPTIONS = ['Hiring', 'Freelance', 'Co-founder', 'Mentorship', 'Investing', 'Networking'];

const INTERESTS_LIST = [
  'AI/ML', 'Startups', 'SaaS', 'Fintech', 'Design', 'Marketing',
  'Sales', 'Product', 'Engineering', 'VC', 'Crypto', 'Health Tech',
  'EdTech', 'E-commerce', 'Climate Tech',
];

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
  });

  const [interests, setInterests] = useState<string[]>(user.interests ?? []);
  const [skills, setSkills] = useState<string[]>(user.skills ?? []);
  const [remote, setRemote] = useState<boolean>(!!(user as unknown as Record<string, unknown>)['remote']);
  const [detectingGps, setDetectingGps] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [customInterestInput, setCustomInterestInput] = useState('');

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  function toggleInterest(val: string) {
    setInterests(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
  }

  function addCustomInterest() {
    const val = customInterestInput.trim();
    if (!val || interests.includes(val)) { setCustomInterestInput(''); return; }
    setInterests(prev => [...prev, val]);
    setCustomInterestInput('');
  }

  function removeCustomInterest(val: string) {
    setInterests(prev => prev.filter(i => i !== val));
  }

  function addSkill() {
    const val = skillInput.trim();
    if (!val || skills.includes(val)) { setSkillInput(''); return; }
    setSkills(prev => [...prev, val]);
    setSkillInput('');
  }

  function removeSkill(val: string) {
    setSkills(prev => prev.filter(s => s !== val));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await apiUpload('/api/me/photos', fd);
      toast('Photo uploaded', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally { setUploading(false); }
  }

  async function detectGps() {
    if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await apiPut('/api/me', { lat: pos.coords.latitude, lng: pos.coords.longitude });
          toast('Location detected', 'success');
        } catch { toast('Could not save location', 'error'); }
        finally { setDetectingGps(false); }
      },
      () => { toast('Location permission denied', 'error'); setDetectingGps(false); },
      { timeout: 8000 },
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, interests, skills, remote };
      const updated = await apiPut<User>('/api/me', payload);
      toast('Profile saved', 'success');
      onSave(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent';
  const labelCls = 'block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5';

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: '1.5px solid', fontFamily: 'inherit',
    background: active ? 'var(--light)' : 'var(--sur2)',
    color: active ? 'var(--primary)' : 'var(--sub)',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    transition: 'all 0.15s',
  });

  const customInterests = interests.filter(i => !INTERESTS_LIST.includes(i));

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
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={form.location} onChange={field('location')} placeholder="e.g. Bengaluru, India" className={inputCls} style={{ flex: 1 }} />
              <button
                type="button"
                onClick={detectGps}
                disabled={detectingGps}
                style={{ padding: '0 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--sur2)', fontSize: 16, cursor: detectingGps ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: detectingGps ? 0.6 : 1 }}
                title="Detect my location"
              >
                {detectingGps ? '…' : '📍'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Open to remote</span>
            <button
              type="button"
              onClick={() => setRemote(r => !r)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0,
                background: remote ? 'var(--primary)' : 'var(--border)', position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: remote ? 22 : 2, width: 20, height: 20,
                borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
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

        {/* Networking intent */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Networking goal</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTENT_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, intent: opt }))}
                style={chipStyle(form.intent.toLowerCase() === opt.toLowerCase())}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">
            Interests{' '}
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>(select at least 3)</span>
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTERESTS_LIST.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleInterest(opt)}
                style={chipStyle(interests.includes(opt))}
              >
                {opt}
              </button>
            ))}
          </div>
          {/* Custom interest add */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="text"
              value={customInterestInput}
              onChange={e => setCustomInterestInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomInterest(); } }}
              placeholder="Add custom interest…"
              className={inputCls}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={addCustomInterest}
              style={{ padding: '0 16px', background: 'var(--primary)', color: 'white', borderRadius: 12, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
            >
              Add
            </button>
          </div>
          {customInterests.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {customInterests.map(i => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--light)', borderRadius: 999, fontSize: 13, color: 'var(--primary)' }}>
                  {i}
                  <button
                    type="button"
                    onClick={() => removeCustomInterest(i)}
                    style={{ opacity: 0.6, cursor: 'pointer', fontSize: 15, background: 'none', border: 'none', color: 'var(--primary)', padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Skills</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
              placeholder="e.g. Product Design"
              className={inputCls}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={addSkill}
              style={{ padding: '0 16px', background: 'var(--primary)', color: 'white', borderRadius: 12, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
            >
              Add
            </button>
          </div>
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {skills.map(s => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#FFF4E7', borderRadius: 999, fontSize: 13, color: 'var(--accent)' }}>
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    style={{ opacity: 0.6, cursor: 'pointer', fontSize: 15, background: 'none', border: 'none', color: 'var(--accent)', padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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

        <div className="pb-4">
          <Button type="submit" loading={saving} fullWidth>Save changes</Button>
        </div>
      </form>
    </div>
  );
}
