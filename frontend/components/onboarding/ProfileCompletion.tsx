'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import OpportunityTags from './OpportunityTags';

const EXP_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;

const schema = z.object({
  headline:         z.string().max(80).optional(),
  bio:              z.string().min(10, 'Bio must be at least 10 characters').max(180).optional().or(z.literal('')),
  profession:       z.string().max(100).optional(),
  industry:         z.string().max(100).optional(),
  experience_level: z.enum(EXP_LEVELS).optional(),
  location:         z.string().max(100).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onNext: (data: FormValues & { interests: string[] }) => void;
  loading: boolean;
}

export default function ProfileCompletion({ onNext, loading }: Props) {
  const [interests, setInterests] = useState<string[]>([]);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const submit = (data: FormValues) => onNext({ ...data, interests });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">Complete your profile</h2>
        <p className="text-[var(--text-secondary)] mt-1">Every field is optional — fill in what feels right.</p>
      </div>

      <Field label="Headline" error={errors.headline?.message}>
        <input
          {...register('headline')}
          placeholder="e.g. Founder building in B2B SaaS"
          className={inputClass}
        />
      </Field>

      <Field label="Bio" error={errors.bio?.message}>
        <textarea
          {...register('bio')}
          rows={3}
          placeholder="Tell people what you're building, exploring, or looking for…"
          className={inputClass + ' resize-none'}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Profession" error={errors.profession?.message}>
          <input {...register('profession')} placeholder="e.g. Product Manager" className={inputClass} />
        </Field>
        <Field label="Industry" error={errors.industry?.message}>
          <input {...register('industry')} placeholder="e.g. FinTech" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Experience level" error={errors.experience_level?.message}>
          <select {...register('experience_level')} className={inputClass}>
            <option value="">Select…</option>
            {EXP_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Location" error={errors.location?.message}>
          <input {...register('location')} placeholder="e.g. Mumbai, India" className={inputClass} />
          <p className="text-xs text-[var(--muted)] mt-1">Your city is shown on your profile. GPS-based proximity discovery uses your approximate location only when you are active.</p>
        </Field>
      </div>

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
