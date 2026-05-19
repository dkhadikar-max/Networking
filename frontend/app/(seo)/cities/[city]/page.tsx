import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CITIES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

interface Props { params: Promise<{ city: string }> }

export async function generateStaticParams() {
  return Object.keys(CITIES).map(city => ({ city }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  const data = CITIES[city];
  if (!data) return {};
  return buildMetadata({
    title: `Professional Networking in ${data.name}`,
    description: `Connect with ${data.name}'s top founders, engineers, and professionals on Build Your Network. Find co-founders, mentors, and collaborators in ${data.state}'s ${data.ecosystem} ecosystem.`,
    canonical: `/cities/${city}`,
    keywords: [
      `networking in ${data.name}`, `startup networking ${data.name}`,
      `find co-founder ${data.name}`, `professional network ${data.state}`,
      `startup community ${data.name}`,
    ],
  });
}

export default async function CityPage({ params }: Props) {
  const { city } = await params;
  const data = CITIES[city];
  if (!data) notFound();

  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const faqs = [
    { q: `How do I network with professionals in ${data.name}?`, a: `Create a free profile on Build Your Network, set your location to ${data.name}, and enable discovery. BYN matches you with professionals in ${data.name}'s ${data.ecosystem} ecosystem based on your skills and intent.` },
    { q: `How do I find a co-founder in ${data.name}?`, a: `On BYN, set your intent to "Find Co-founder", add your skills, and set your location to ${data.name}. You will be matched with complementary founders in ${data.state}.` },
    { q: `What startup hubs are in ${data.name}?`, a: `${data.name}'s key startup hubs include ${data.hubs}. BYN connects you with founders from across ${data.name}'s startup ecosystem.` },
    { q: `Is Build Your Network available in ${data.name}?`, a: `Yes. BYN works across all Indian cities including ${data.name}. It runs in your browser — no app download needed.` },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(`Professional Networking in ${data.name}`, `${APP_URL}/cities/${city}`, `Connect with ${data.name}'s top professionals on BYN.`, [{ name: data.name, url: `${APP_URL}/cities/${city}` }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline={`Connect with ${data.name}'s best professionals`}
        subheadline={`Find co-founders, mentors, and collaborators in ${data.name}'s ${data.ecosystem} ecosystem — powered by intent-based matching.`}
        body={`${data.excerpt} Build Your Network (BYN) is the fastest way to find the right people in ${data.name}. Unlike LinkedIn, BYN shows professionals actively looking to connect, collaborate, or co-found. Key hubs: ${data.hubs}.`}
        tags={data.ecosystem.split(', ')}
        faqs={faqs}
        cta={`Join ${data.name}'s professional network`}
        breadcrumb={[{ label: 'Cities', href: `${APP_URL}/cities` }, { label: data.name, href: `${APP_URL}/cities/${city}` }]}
        stats={stats}
      />
    </>
  );
}
