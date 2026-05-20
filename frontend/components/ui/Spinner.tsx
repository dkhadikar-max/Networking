import clsx from 'clsx';

export default function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin',
        className ?? 'w-6 h-6'
      )}
    />
  );
}
