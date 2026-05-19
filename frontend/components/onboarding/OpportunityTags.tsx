'use client';

import clsx from 'clsx';

const POPULAR_INTERESTS = [
  'Startups','SaaS','VC / Investing','E-commerce','Creator Economy',
  'Web3 / Crypto','AI / ML','Product Management','Marketing','Sales',
  'Design','Engineering','Finance','Climate Tech','EdTech','HealthTech',
  'B2B','Freelancing','Leadership','Community Building',
];

interface Props {
  selected: string[];
  onChange: (tags: string[]) => void;
}

export default function OpportunityTags({ selected, onChange }: Props) {
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter(t => t !== tag)
        : [...selected, tag]
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-secondary)] mb-3">Your interests</p>
      <div className="flex flex-wrap gap-2">
        {POPULAR_INTERESTS.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm border transition-all',
              selected.includes(tag)
                ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]'
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
