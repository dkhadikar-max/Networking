/* eslint-disable @next/next/no-img-element */
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useRef, KeyboardEvent } from 'react';
import { apiUpload } from '@/lib/api';
import OpportunityTags from './OpportunityTags';
import { IconCamera } from './icons';

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
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await apiUpload<{ url: string }>('/api/me/photos', fd);
      setPhotoUrl(res?.url ?? URL.createObjectURL(file));
    } catch {
      setUploadError('Photo upload failed. You can continue without a photo.');
    } finally { setUploading(false); }
  }

  const submit = (data: FormValues) => onNext({ ...data, interests, skills });

  return (
    <form onSubmit={handleSubmit(submit)} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px', marginBottom: 5 }}>
          Complete your profile
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          The more you share, the better your matches.
        </p>
      </div>

      {/* Photo upload */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <label htmlFor="ob-photo-input" style={{ cursor: 'pointer' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
            background: photoUrl ? 'transparent' : 'linear-gradient(135deg,#D5F5EE,#EDF9FF)',
            border: photoUrl ? '3px solid #157A6E' : '2px dashed #B8EDE5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: photoUrl ? '0 4px 16px rgba(21,122,110,0.2)' : 'none',
            transition: 'all 0.2s ease',
          }}>
            {photoUrl ? (
              <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : uploading ? (
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid #157A6E', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            ) : (
              <div style={{ color: '#157A6E' }}><IconCamera /></div>
            )}
          </div>
        </label>
        <label
          htmlFor="ob-photo-input"
          style={{
            cursor: 'pointer', fontSize: 12, color: '#157A6E', fontWeight: 700, letterSpacing: '0.2px',
            padding: '6px 14px', borderRadius: 999, background: 'rgba(21,122,110,0.08)',
            border: '1.5px solid rgba(21,122,110,0.25)',
          }}
        >
          {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add profile photo'}
        </label>
        {uploadError && (
          <p style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '6px 12px', borderRadius: 8, textAlign: 'center', maxWidth: 280 }}>
            {uploadError}
          </p>
        )}
        <input
          id="ob-photo-input"
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </div>

      {/* What are you building */}
      <Field label="What are you currently building?" error={errors.working_on?.message}>
        <textarea
          {...register('working_on')}
          rows={2}
          placeholder="e.g. A B2B SaaS for restaurant inventory management"
          style={{ ...inputStyle, resize: 'none' }}
        />
      </Field>

      <Field label="Headline" error={errors.headline?.message}>
        <input
          {...register('headline')}
          placeholder="e.g. Founder building in B2B SaaS"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Profession" error={errors.profession?.message}>
          <input {...register('profession')} placeholder="e.g. Product Manager" style={inputStyle} />
        </Field>
        <Field label="Location" error={errors.location?.message}>
          <input {...register('location')} placeholder="e.g. Mumbai" style={inputStyle} />
        </Field>
      </div>

      {/* Skills chip input */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
          Skills <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(press Enter to add)</span>
        </div>
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '10px 12px', borderRadius: 12,
            border: '1.5px solid #E2E8F0', background: '#F8FAFC',
            minHeight: 48, cursor: 'text',
          }}
          onClick={() => skillRef.current?.focus()}
        >
          {skills.map(s => (
            <span key={s} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(21,122,110,0.08)', border: '1px solid rgba(21,122,110,0.2)',
              fontSize: 12, fontWeight: 600, color: '#157A6E',
            }}>
              {s}
              <button
                type="button"
                onClick={() => setSkills(prev => prev.filter(x => x !== s))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#157A6E', fontSize: 14, lineHeight: 1, opacity: 0.6 }}
              >×</button>
            </span>
          ))}
          <input
            ref={skillRef}
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={handleSkillKey}
            onBlur={() => skillInput.trim() && addSkill(skillInput)}
            placeholder={skills.length === 0 ? 'e.g. React, Fundraising, Design…' : ''}
            style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, minWidth: 120, background: 'transparent', color: '#0F172A', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      <Field label="Industry" error={errors.industry?.message}>
        <input {...register('industry')} placeholder="e.g. FinTech, EdTech, SaaS…" style={inputStyle} />
      </Field>

      <Field label="Bio" error={errors.bio?.message}>
        <textarea
          {...register('bio')}
          rows={2}
          placeholder="Tell people what you're exploring or looking for…"
          style={{ ...inputStyle, resize: 'none' }}
        />
      </Field>

      <OpportunityTags selected={interests} onChange={setInterests} />

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '15px 16px', borderRadius: 12,
          background: '#F4A259', color: '#fff', border: 'none',
          fontSize: 15, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.45 : 1,
          boxShadow: loading ? 'none' : '0 8px 20px rgba(244,162,89,0.3)',
          fontFamily: 'inherit', transition: 'opacity 0.15s',
        }}
      >
        {loading ? 'Saving…' : 'Finish profile →'}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 14px', borderRadius: 12,
  border: '1.5px solid #E2E8F0', background: '#F8FAFC',
  color: '#0F172A', fontSize: 14, outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
};

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {label}
      </div>
      {children}
      {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>{error}</p>}
    </div>
  );
}
