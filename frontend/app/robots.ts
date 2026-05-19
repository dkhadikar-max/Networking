import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/seo/data';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/retention', '/onboarding'] }],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
