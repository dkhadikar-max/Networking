'use client';

// Renders the REAL Discover card component — same file used in the live
// app — with illustrative sample data. No network calls fire: Connect/Skip
// are inert here since there is no `id` on the sample profile (SwipeCard
// only wires the Priority-message action when a real uid is present).
import SwipeCard from '@/components/discover/SwipeCard';
import { SAMPLE_DISCOVER_PROFILE } from './samples';

export default function DiscoverPreview() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <SwipeCard
        profile={SAMPLE_DISCOVER_PROFILE}
        onConnect={async () => {}}
        onSkip={() => {}}
      />
    </div>
  );
}
