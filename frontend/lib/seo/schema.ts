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

// Public Circles teaser page (see app/(seo)/c/[id]) — a partial preview of a
// post from a public Circle group, not the full discussion. DiscussionForumPosting
// is the schema.org type Reddit/Quora-style threads use; kept intentionally
// light (no interactionStatistic/comment fields) since counts and replies are
// never exposed on the public surface per the locked exposure policy.
export function discussionPostSchema(input: {
  excerpt: string; url: string; groupName: string; tags: string[];
  createdAt: string; authorFirstName: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: input.excerpt,
    text: input.excerpt,
    url: input.url,
    datePublished: input.createdAt,
    keywords: input.tags.join(', '),
    inLanguage: 'en-IN',
    isPartOf: { '@type': 'WebSite', name: APP_NAME, url: APP_URL },
    about: input.groupName,
    author: { '@type': 'Person', name: input.authorFirstName || 'A Build Your Network member' },
    publisher: { '@type': 'Organization', name: APP_NAME, url: APP_URL, logo: OG_IMAGE },
  };
}

// /c discovery index page — lists eligible public Circles posts. Schema.org
// ItemList of the same DiscussionForumPosting shape used on each /c/[id]
// page, kept to url + headline only (no excerpt duplication needed here;
// crawlers get the full teaser from the individual page's own schema).
export function circleItemListSchema(items: { url: string; excerpt: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.excerpt,
    })),
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
