import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

const variants: Record<Variant, string> = {
  primary:   'bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] shadow-sm',
  secondary: 'bg-[var(--sur2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)]',
  gold:      'bg-[var(--accent)] text-white hover:opacity-90 shadow-sm',
  danger:    'bg-[var(--danger)] text-white hover:opacity-90',
  ghost:     'bg-transparent text-[var(--primary)] hover:bg-[var(--light)]',
};

export default function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm px-5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        variants[variant],
        fullWidth && 'w-full',
        (disabled || loading) && 'opacity-40 cursor-not-allowed',
        className
      )}
    >
      {loading && (
        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      )}
      {children}
    </button>
  );
}
