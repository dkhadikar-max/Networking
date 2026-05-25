import { APP_NAME, APP_URL, OG_IMAGE } from './data';

export function webPageSchema(title: string, url: string, description: string, breadcrumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: title,
        url,
        description,
        inLanguage: 'en-IN',
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
            ...breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 2, name: b.name, item: b.url })),
          ],
        },
      },
      {
        '@type': 'Organization',
        name: APP_NAME,
        url: APP_URL,
        logo: OG_IMAGE,
        sameAs: [
        'https://twitter.com/buildyournetwork',
        'https://www.linkedin.com/company/build-your-network',
        'https://www.producthunt.com/products/build-your-network',
        'https://www.indiehackers.com/product/build-your-network',
      ],
      },
    ],
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
