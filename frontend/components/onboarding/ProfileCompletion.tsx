'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useRef, KeyboardEvent } from 'react';
import { apiUpload } from '@/lib/api';
import OpportunityTags from './OpportunityTags';

const EXP_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;

const schema = z.object({
  working_on:       z.string().max(200).optional(),
  headline:         z.string().max(80).optional(),
  bio:              z.string().min(10, 'Bio must be at least 10 characters').max(180).optional().or(z.literal('')),
  profession:       z.string().max(100).optional(),
  industry:         z.string().max(100).optional(),
  experience_level: z.enum(EXP_LEVELS).optional(),
  location:         z.string().max(100).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onNext: (data: FormValues & { interests: string[]; skills: string[] }) => void;
  loading: boolean;
}

export default function ProfileCompletion({ onNext, loading }: Props) {
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const skillRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function addSkill(val: string) {
    const s = val.trim();
    if (s && !skills.includes(s) && skills.length < 10) {
      setSkills(prev => [...prev, s]);
    }
    setSkillInput('');
  }

  function handleSkillKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillInput); }
    if (e.key === 'Backspace' && !skillInput && skills.length) {
      setSkills(prev => prev.slice(0, -1));
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await apiUpload<{ url: string }>('/api/me/photos', fd);
      setPhotoUrl(res?.url ?? URL.createObjectURL(file));
    } catch { /* silently ignore — photo is optional */ }
    finally { setUploading(false); }
  }

  const submit = (data: FormValues) => onNext({ ...data, interests, skills });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">Complete your profile</h2>
        <p className="text-[var(--text-secondary)] mt-1">The more you share, the better your matches.</p>
      </div>

      {/* Photo upload */}
      <div className="flex flex-col items-center gap-3">
        <label htmlFor="ob-photo-input" style={{ cursor: 'pointer' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: photoUrl ? 'transparent' : 'var(--sur2)',
            border: '2px dashed var(--border)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative',
          }}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 28 }}>{uploading ? '…' : '📷'}</span>
            )}
          </div>
        </label>
        <label htmlFor="ob-photo-input" style={{ cursor: 'pointer', fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
          {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add profile photo'}
        </label>
        <input
          id="ob-photo-input"
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </div>

      {/* What are you building — highest match signal */}
      <Field label="What are you currently building?" error={errors.working_on?.message}>
        <textarea
          {...register('working_on')}
          rows={2}
          placeholder="e.g. A B2B SaaS for restaurant inventory management"
          className={inputClass + ' resize-none'}
        />
      </Field>

      <Field label="Headline" error={errors.headline?.message}>
        <input
          {...register('headline')}
          placeholder="e.g. Founder building in B2B SaaS"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Profession" error={errors.profession?.message}>
          <input {...register('profession')} placeholder="e.g. Product Manager" className={inputClass} />
        </Field>
        <Field label="Location" error={errors.location?.message}>
          <input {...register('location')} placeholder="e.g. Mumbai" className={inputClass} />
        </Field>
      </div>

      {/* Skills — chip input */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--text)]">Skills <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(press Enter to add)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'white', minHeight: 44, cursor: 'text' }} onClick={() => skillRef.current?.focus()}>
          {skills.map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, background: 'var(--sur2)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {s}
              <button type="button" onClick={() => setSkills(prev => prev.filter(x => x !== s))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input
            ref={skillRef}
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={handleSkillKey}
            onBlur={() => skillInput.trim() && addSkill(skillInput)}
            placeholder={skills.length === 0 ? 'e.g. React, Fundraising, Design…' : ''}
            style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, minWidth: 120, background: 'transparent', color: 'var(--text)' }}
          />
        </div>
      </div>

      <Field label="Industry" error={errors.industry?.message}>
        <input {...register('industry')} placeholder="e.g. FinTech, EdTech, SaaS…" className={inputClass} />
      </Field>

      <Field label="Bio" error={errors.bio?.message}>
        <textarea
          {...register('bio')}
          rows={2}
          placeholder="Tell people what you're exploring or looking for…"
          className={inputClass + ' resize-none'}
        />
      </Field>

      <OpportunityTags selected={interests} onChange={setInterests} />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold disabled:opacity-40 hover:bg-[var(--primary-dark)] transition-colors"
      >
        {loading ? 'Saving…' : 'Finish profile →'}
      </button>
    </form>
  );
}

const inputClass =
  'w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-white text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm';

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-[var(--text)]">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
