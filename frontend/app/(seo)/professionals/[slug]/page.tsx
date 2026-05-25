import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ROLES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

// /professionals/[slug] maps to the same role data as /roles/[role]
// Provides an alternate URL pattern that matches common search intent:
// "networking for product managers" → /professionals/product-manager

interface Props { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return Object.keys(ROLES).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = ROLES[slug];
  if (!data) return {};
  return buildMetadata({
    title: `${data.name} Professionals Network in India`,
    description: `Connect with ${data.name} professionals in India on Build Your Network. ${data.description}. Intent-based matching. Free to join.`,
    canonical: `/roles/${slug}`,
    keywords: [
      `${data.name} professional network India`,
      `connect with ${data.name}s India`,
      `${data.name} networking platform`,
      `find ${data.name} India`,
      `best network for ${data.name}s`,
    ],
  });
}

export default async function ProfessionalPage({ params }: Props) {
  const { slug } = await params;
  const data = ROLES[slug];
  if (!data) notFound();

  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const faqs = [
    ...data.faqs,
    { q: `Is Build Your Network free for ${data.name}s?`, a: `Yes. BYN is free to join and use. ${data.name}s can create a profile, discover people, and start connecting at no cost. A premium tier is available for power users who want more daily swipes and advanced filters.` },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(`${data.name} Professional Network India`, `${APP_URL}/professionals/${slug}`, data.description, [{ name: 'Professionals', url: `${APP_URL}/professionals` }, { name: data.name, url: `${APP_URL}/professionals/${slug}` }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline={`Where ${data.name}s build their network in India`}
        subheadline={`${data.description} — connected by shared intent and complementary skills on Build Your Network.`}
        body={`India has millions of talented ${data.name}s. The challenge is not finding people — it is finding the right ones. Build Your Network (BYN) solves this with intent-based matching: every person you see is actively looking for ${data.lookingFor.slice(0, 2).join(' or ').toLowerCase()}. No noise. No cold messages to strangers. Just relevant, high-quality professional connections that move your career or business forward.`}
        tags={data.lookingFor}
        faqs={faqs}
        cta={`Join India's ${data.name} network`}
        breadcrumb={[{ label: 'Professionals', href: `${APP_URL}/professionals` }, { label: data.name, href: `${APP_URL}/professionals/${slug}` }]}
        stats={stats}
      />
    </>
  );
}
