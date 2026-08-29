'use client';

import DiscoverySummaryCard from './DiscoverySummaryCard';

/**
 * Hero section profile demo — renders a self-contained compact discovery
 * summary card. Visually independent from the landing page layout.
 * The full 2500px profile document is a separate state (Full Profile →).
 */
export default function DiscoverPreview() {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <DiscoverySummaryCard />
    </div>
  );
}


