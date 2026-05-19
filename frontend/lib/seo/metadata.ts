import type { Metadata } from 'next';
import { APP_NAME, APP_URL, OG_IMAGE } from './data';

interface MetaInput {
  title: string;
  description: string;
  canonical: string;
  keywords?: string[];
}

export function buildMetadata({ title, description, canonical, keywords = [] }: MetaInput): Metadata {
  const fullTitle = `${title} — ${APP_NAME}`;
  const url = `${APP_URL}${canonical}`;
  return {
    title: fullTitle,
    description,
    keywords: keywords.join(', '),
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: fullTitle,
      description,
      siteName: APP_NAME,
      locale: 'en_IN',
      images: [{ url: OG_IMAGE, alt: `${APP_NAME} — ${title}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [OG_IMAGE],
      site: '@buildyournetwork',
    },
  };
}
