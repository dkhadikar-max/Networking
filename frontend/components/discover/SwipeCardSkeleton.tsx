// Card-shaped loading placeholder — mirrors SwipeCard's own regions
// (intent banner, identity row, why-matched, body blocks) so the layout
// doesn't jump when the real card replaces it. Purely decorative: no
// interactive elements, so nothing here needs its own a11y treatment beyond
// being hidden from assistive tech (the spinner it replaces wasn't
// announced either — this isn't a regression).
export default function SwipeCardSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-block" style={{ height: 46, borderRadius: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
        <div className="skeleton-block" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton-block" style={{ height: 14, width: '55%' }} />
          <div className="skeleton-block" style={{ height: 11, width: '75%' }} />
        </div>
      </div>
      <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <div className="skeleton-block" style={{ height: 10, width: '35%', marginBottom: 8 }} />
        <div className="skeleton-block" style={{ height: 11, width: '90%', marginBottom: 5 }} />
        <div className="skeleton-block" style={{ height: 11, width: '70%' }} />
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div className="skeleton-block" style={{ height: 48, borderRadius: 10 }} />
        <div className="skeleton-block" style={{ height: 48, borderRadius: 10 }} />
        <div className="skeleton-block" style={{ height: 120, borderRadius: 10 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 18px', borderTop: '1px solid var(--border)' }}>
        <div className="skeleton-block" style={{ flex: 1, height: 44, borderRadius: 'var(--r-lg)' }} />
        <div className="skeleton-block" style={{ flex: 1, height: 44, borderRadius: 'var(--r-lg)' }} />
      </div>
    </div>
  );
}
