import type { MetadataRoute } from 'next';
import { APP_URL, CITIES, INDUSTRIES, ROLES } from '@/lib/seo/data';

const HOME_DATE = new Date('2026-05-01');
const LANDING_DATE = new Date('2025-12-01');
const CONTENT_DATE = new Date('2025-10-01');

export default function sitemap(): MetadataRoute.Sitemap {
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

  return [
    { url: APP_URL, lastModified: HOME_DATE, changeFrequency: 'weekly', priority: 1.0 },
    ...landingPages,
    ...hubs,
    ...cities,
    ...industries,
    ...roles,
    ...professionals,
  ];
}
