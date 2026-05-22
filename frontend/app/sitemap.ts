import type { MetadataRoute } from 'next';
import { APP_URL, CITIES, INDUSTRIES, ROLES } from '@/lib/seo/data';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const cities = Object.keys(CITIES).map(slug => ({
    url: `${APP_URL}/cities/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const industries = Object.keys(INDUSTRIES).map(slug => ({
    url: `${APP_URL}/industries/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const roles = Object.keys(ROLES).map(slug => ({
    url: `${APP_URL}/roles/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const landingPages = [
    'networking-for-founders',
    'linkedin-alternative',
    'networking-for-entrepreneurs',
    'networking-for-creators',
    'networking-for-freelancers',
    'startup-community-india',
    'business-networking-app',
    'networking-for-investors',
  ].map(slug => ({
    url: `${APP_URL}/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }));

  return [
    { url: APP_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${APP_URL}/onboarding`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    ...landingPages,
    ...cities,
    ...industries,
    ...roles,
  ];
}
