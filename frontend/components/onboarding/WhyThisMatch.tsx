'use client';

interface Props {
  sharedInterests: string[];
  sharedIntent: string | null;
  mutualConnections?: number;
}

export default function WhyThisMatch({ sharedInterests, sharedIntent, mutualConnections }: Props) {
  const reasons: string[] = [];
  if (sharedIntent) reasons.push(`Both here to ${sharedIntent.toLowerCase()}`);
  if (sharedInterests.length) reasons.push(`Shared interest in ${sharedInterests.slice(0, 2).join(' & ')}`);
  if (mutualConnections) reasons.push(`${mutualConnections} mutual connection${mutualConnections > 1 ? 's' : ''}`);

  if (!reasons.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {reasons.map(r => (
        <span
          key={r}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--highlight)] text-[var(--primary)] text-xs font-medium"
        >
          ✦ {r}
        </span>
      ))}
    </div>
  );
}
