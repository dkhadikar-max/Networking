// Card-shaped loading placeholder — mirrors the REAL SwipeCard's current
// geometry region-for-region (420px hero, identity block, trust/intent
// chips, Direct Match, Building/Looking For previews, absolute footer) so
// the swap from skeleton to loaded card is a content fade, not a layout
// jump. Rebuilt 2026-08-31 after SwipeCard's Discover-decision-surface
// trim — the previous version mirrored the OLD full-editorial card shape
// (small circular avatar row, no hero) and had drifted into a visibly
// different silhouette. Root treatment matches too: SwipeCard's own root
// is edge-to-edge inside .card-stack-area (no border-radius/shadow/
// border/width-cap) — this skeleton no longer boxes itself in a floating
// card the way `.skeleton-card`'s CSS used to (that styling mirrored
// `.swipe-card`, an orphaned class the real component never used). The
// scrollable content is wrapped with the same 96px bottom padding
// SwipeCard reserves above its absolute footer — without it the last
// preview line collides with the action buttons.
//
// Purely decorative: no interactive elements, so nothing here needs its
// own a11y treatment beyond being hidden from assistive tech.
export default function SwipeCardSkeleton() {
  return (
    <div className="w-full h-full bg-white relative overflow-y-auto" aria-hidden="true">
      <div className="w-full" style={{ paddingBottom: 96 }}>
        {/* Hero (420px, matches SwipeCard's hero section exactly) */}
        <div className="skeleton-block" style={{ width: '100%', height: 420, borderRadius: 0 }} />

        {/* Identity block */}
        <div style={{ padding: '16px 20px 0 20px' }}>
          <div className="skeleton-block" style={{ height: 26, width: '55%', marginBottom: 10 }} />
          <div className="skeleton-block" style={{ height: 15, width: '70%', marginBottom: 8 }} />
          <div className="skeleton-block" style={{ height: 13, width: '38%' }} />

          {/* Trust score + intent chips */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
            <div className="skeleton-block" style={{ height: 26, width: 108, borderRadius: 6 }} />
            <div className="skeleton-block" style={{ height: 26, width: 150, borderRadius: 6 }} />
          </div>
        </div>

        {/* Direct Match */}
        <div style={{ margin: '20px 0 0', padding: '0 20px' }}>
          <div className="skeleton-block" style={{ height: 60, width: '100%', borderRadius: 12 }} />
        </div>

        {/* Building preview */}
        <div style={{ margin: '20px 0 0', padding: '0 20px' }}>
          <div className="skeleton-block" style={{ height: 10, width: 64, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ height: 14, width: '92%', marginBottom: 6 }} />
          <div className="skeleton-block" style={{ height: 14, width: '68%' }} />
        </div>

        {/* Looking For preview */}
        <div style={{ margin: '16px 0 0', padding: '0 20px' }}>
          <div className="skeleton-block" style={{ height: 10, width: 84, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ height: 14, width: '85%', marginBottom: 6 }} />
          <div className="skeleton-block" style={{ height: 14, width: '55%' }} />
        </div>
      </div>

      {/* Action footer — absolute, matching SwipeCard's own footer position
          exactly, so it doesn't shift when the real card mounts. */}
      <div className="absolute bottom-0 inset-x-0 px-6 py-3.5 flex items-center gap-3">
        <div className="skeleton-block" style={{ flex: 1, height: 44, borderRadius: 8 }} />
        <div className="skeleton-block" style={{ flex: 1, height: 44, borderRadius: 8 }} />
      </div>
    </div>
  );
}
