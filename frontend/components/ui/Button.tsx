import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

const BASE: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, borderRadius: 12, fontWeight: 600, fontSize: 14,
  padding: '10px 20px', transition: 'opacity 0.15s, background 0.15s',
  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
  outline: 'none', whiteSpace: 'nowrap',
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary:   { background: 'var(--primary)', color: '#ffffff' },
  secondary: { background: 'var(--sur2)', color: 'var(--text)', border: '1.5px solid var(--border)' },
  gold:      { background: 'var(--accent)', color: '#ffffff' },
  danger:    { background: 'var(--danger)', color: '#ffffff' },
  ghost:     { background: 'transparent', color: 'var(--primary)' },
};

export default function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  style,
  children,
  disabled,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        ...BASE,
        ...VARIANTS[variant],
        ...(fullWidth ? { width: '100%' } : {}),
        ...(isDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        ...style,
      }}
    >
      {loading && (
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.4)',
          borderTopColor: 'white',
          animation: 'spin 0.7s linear infinite',
          flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
}
