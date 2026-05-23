'use client';

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
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
        Your interests
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POPULAR_INTERESTS.map(tag => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: active ? '1.5px solid #157A6E' : '1.5px solid #E2E8F0',
                background: active ? '#157A6E' : '#F8FAFC',
                color: active ? '#fff' : '#64748B',
                cursor: 'pointer', transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
