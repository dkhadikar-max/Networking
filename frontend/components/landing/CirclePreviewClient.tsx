'use client';

// `dynamic(..., { ssr: false })` can only be called from a Client Component
// in the App Router — this thin wrapper exists so app/page.tsx (a Server
// Component) can still render CirclePreview client-only. See CirclePreview
// for why: it renders a "time ago" string that drifts between SSR and
// hydration once real time has elapsed between them.
import dynamic from 'next/dynamic';

const CirclePreview = dynamic(() => import('./CirclePreview'), { ssr: false });

export default CirclePreview;
