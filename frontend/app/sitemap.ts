import type { MetadataRoute } from 'next';
import { APP_URL, CITIES, INDUSTRIES, ROLES } from '@/lib/seo/data';

// NOT LIVE at buildyournetwork.online — next.config.ts rewrites the exact
// path '/sitemap.xml' to the Express backend's own app.get('/sitemap.xml',
// ...) handler (server.js), and that rewrite wins over this file for the
// real domain (confirmed by curling a running instance: the served sitemap
// carries server.js's own city/URL data, not CITIES/INDUSTRIES/ROLES from
// lib/seo/data.ts below — a pre-existing situation, not introduced here).
// The Circles section added below (2026-09-04) is real, tested logic — it's
// just inert in production. The actual live sitemap entries for /c and
// /c/[id] were added directly to server.js's handler instead, reusing
// getPublicCircleIndexEntries(). Left this file as-is rather than deleting
// it: harmless either way, and it would start working correctly on its own
// if the rewrite in next.config.ts were ever removed.

const HOME_DATE = new Date('2026-05-01');
const LANDING_DATE = new Date('2025-12-01');
const CONTENT_DATE = new Date('2025-10-01');

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';

// Circle posts are created continuously and eligibility changes over time
// (opt-out, a report, edits, a Circle going private — see server.js's
// runCirclesPublicIndexingSweep and the locked exposure policy in
// migrations/018_circles_public_indexing.sql), so this file can't be a
// build-time static enumeration the way cities/industries/roles are. This
// revalidate makes the WHOLE sitemap ISR — regenerated at most every 5
// minutes, matching the backend's own Cache-Control: max-age=300 on
// /api/circles/public-index. The static sections below are unaffected by
// this (they're pure in-memory lookups either way).
export const revalidate = 300;

interface PublicCirclePost { id: string; indexed_at: string }

async function fetchIndexedCirclePosts(): Promise<PublicCirclePost[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/circles/public-index?limit=1000`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    // A backend hiccup here must not take the whole sitemap down — every
    // other section (cities/industries/roles/landing pages) still matters.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cities = Object.keys(CITIES).map(slug => ({
    url: `${APP_URL}/cities/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const industries = Object.keys(INDUSTRIES).map(slug => ({
    url: `${APP_URL}/industries/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const roles = Object.keys(ROLES).map(slug => ({
    url: `${APP_URL}/roles/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const professionals = Object.keys(ROLES).map(slug => ({
    url: `${APP_URL}/professionals/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const landingPages = [
    // Next.js (seo) pages
    'networking-for-founders',
    'linkedin-alternative',
    'networking-for-entrepreneurs',
    'networking-for-creators',
    'networking-for-freelancers',
    'startup-community-india',
    'business-networking-app',
    'networking-for-investors',
    // Express-served pages (proxied via next.config.ts rewrites)
    'what-is-byn',
    'intent-based-networking',
    'find-cofounders',
    'angel-investors-india',
    'linkedin-vs-byn',
    'best-networking-platform-for-founders',
    'meetup-alternative',
    'startup-founders-india',
    'professional-networking',
    'build-professional-network',
    'find-startup-mentor',
    'startup-networking-events',
    'startup-networking-us',
    'startup-networking-europe',
    'startup-networking-uk',
    'startup-networking-australia',
    'startup-networking-singapore',
    'startup-networking-dubai',
    'startup-networking-kenya',
    'startup-networking-south-africa',
    'startup-networking-turkey',
  ].map(slug => ({
    url: `${APP_URL}/${slug}`,
    lastModified: LANDING_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }));

  const hubs = [
    { slug: 'cities', priority: 0.8 },
    { slug: 'roles', priority: 0.8 },
    { slug: 'industries', priority: 0.8 },
  ].map(({ slug, priority }) => ({
    url: `${APP_URL}/${slug}`,
    lastModified: CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority,
  }));

  const indexedPosts = await fetchIndexedCirclePosts();
  const circlePosts = indexedPosts.map(p => ({
    url: `${APP_URL}/c/${p.id}`,
    lastModified: new Date(p.indexed_at),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));
  const circlesIndex = [{
    url: `${APP_URL}/c`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }];

  return [
    { url: APP_URL, lastModified: HOME_DATE, changeFrequency: 'weekly', priority: 1.0 },
    ...landingPages,
    ...hubs,
    ...cities,
    ...industries,
    ...roles,
    ...professionals,
    ...circlesIndex,
    ...circlePosts,
  ];
}
