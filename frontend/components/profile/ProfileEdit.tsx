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

  const customInterests = interests.filter(i => !INTERESTS_LIST.includes(i));

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <form onSubmit={handleSave} style={{ maxWidth: 560, margin: '0 auto', padding: '16px 14px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Header — sticky so Save is always reachable */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', marginBottom: 4,
          background: 'white', borderBottom: '1px solid var(--border)',
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>Edit profile</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </div>

        {/* Photo upload */}
        <div className="profile-panel" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar src={user.photos?.[0]} name={user.name} size={72} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Profile photo</p>
            <label style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <span style={{
                display: 'inline-block', padding: '9px 18px', borderRadius: 'var(--r-sm)',
                border: '1.5px solid var(--border2)', fontSize: 13, fontWeight: 600,
                color: uploading ? 'var(--dim)' : 'var(--sub)', background: 'var(--sur2)',
              }}>
                {uploading ? 'Uploading…' : 'Upload photo'}
              </span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Basic info */}
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="panel-title">Basic info</p>
          <div>
            <label className="pe-label">Full name</label>
            <input type="text" value={form.name} onChange={field('name')} required className="pe-input" placeholder="Your full name" />
          </div>
          <div>
            <label className="pe-label">Headline</label>
            <input type="text" value={form.headline} onChange={field('headline')} placeholder="e.g. Founder & CEO at Acme" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Current role</label>
            <input type="text" value={form.current_role} onChange={field('current_role')} placeholder="e.g. Product Manager" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Location</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={form.location} onChange={field('location')} placeholder="e.g. Bengaluru, India" className="pe-input" style={{ flex: 1 }} />
              <button type="button" onClick={detectGps} disabled={detectingGps} className="pe-gps" title="Detect my location">
                {detectingGps ? '…' : '📍'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Open to remote</span>
            <button
              type="button"
              onClick={() => setRemote(r => !r)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0,
                background: remote ? 'var(--primary)' : 'var(--border2)', position: 'relative', transition: 'background 0.2s',
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
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="panel-title">About you</p>
          <div>
            <label className="pe-label">Bio</label>
            <textarea rows={3} value={form.bio} onChange={field('bio')} placeholder="Tell people about yourself" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Working on</label>
            <textarea rows={2} value={form.working_on} onChange={field('working_on')} placeholder="What are you building?" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Currently exploring</label>
            <textarea rows={2} value={form.currently_exploring} onChange={field('currently_exploring')} placeholder="What are you curious about?" className="pe-input" />
          </div>
        </div>

        {/* Networking goal */}
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="panel-title">Networking goal</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTENT_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, intent: opt }))}
                className={'pe-chip' + (form.intent.toLowerCase() === opt.toLowerCase() ? ' active' : '')}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="panel-title">
            Interests{' '}
            <span style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 400 }}>(select at least 3)</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTERESTS_LIST.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleInterest(opt)}
                className={'pe-chip' + (interests.includes(opt) ? ' active' : '')}
              >
                {opt}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={customInterestInput}
              onChange={e => setCustomInterestInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomInterest(); } }}
              placeholder="Add custom interest…"
              className="pe-input"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={addCustomInterest} className="pe-add">Add</button>
          </div>
          {customInterests.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {customInterests.map(i => (
                <span key={i} className="pe-tag">
                  {i}
                  <button type="button" onClick={() => removeCustomInterest(i)} className="pe-tag-del">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="panel-title">Skills</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
              placeholder="e.g. Product Design"
              className="pe-input"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={addSkill} className="pe-add">Add</button>
          </div>
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {skills.map(s => (
                <span key={s} className="pe-tag">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="pe-tag-del">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Social links */}
        <div className="profile-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="panel-title">Links</p>
          <div>
            <label className="pe-label">LinkedIn URL</label>
            <input type="url" value={form.linkedin} onChange={field('linkedin')} placeholder="https://linkedin.com/in/…" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Website</label>
            <input type="url" value={form.website} onChange={field('website')} placeholder="https://yoursite.com" className="pe-input" />
          </div>
          <div>
            <label className="pe-label">Instagram handle</label>
            <input type="text" value={form.instagram} onChange={field('instagram')} placeholder="yourhandle" className="pe-input" />
          </div>
        </div>

        <Button type="submit" loading={saving} fullWidth>Save changes</Button>

      </form>
    </div>
  );
}
