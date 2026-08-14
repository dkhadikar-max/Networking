'use client';

// Renders the REAL Circles post card component with illustrative sample data.
import CirclePostCard from '@/components/circles/CirclePostCard';
import { SAMPLE_CIRCLE_POST } from './samples';

export default function CirclePreview() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <CirclePostCard post={SAMPLE_CIRCLE_POST} />
    </div>
  );
}
