import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Networking for Startup Founders',
  description: 'Connect with founders, investors, and co-founders actively building startups. Build Your Network matches you by intent — not algorithm. Free to join.',
  canonical: '/networking-for-founders',
  keywords: [
    'networking for founders', 'startup founder network', 'founder community india',
    'find co-founder india', 'startup networking app', 'founder to founder networking',
  ],
});

const faqs = [
  { q: 'Is BYN only for startup founders?', a: 'No. BYN is built for everyone building something — founders, engineers, designers, investors, mentors, and creators. But intent-based matching makes it especially effective for founders who need co-founders, early hires, or investors fast.' },
  { q: 'How do I find a co-founder on BYN?', a: 'Set your intent to "Find Co-founder", add your skills and what you are building, and BYN surfaces founders with complementary backgrounds in your city or nationwide. Matching is mutual — both parties must show interest before messaging opens.' },
  { q: 'Can I network with investors on BYN?', a: 'Yes. Investors set their intent to "Investing" and discover founders seeking funding. Founders set their intent to "Looking for Investment" to surface in investor searches. No cold emails required.' },
  { q: 'How is BYN different from LinkedIn for founders?', a: 'LinkedIn is a resume network built for employers and recruiters. BYN is an action network — everyone states what they are actively looking for right now. You only connect with people who want the same thing, cutting through noise.' },
  { q: 'Is BYN free for founders?', a: 'Yes. BYN is free — 30 daily swipes, direct messaging after matching, and location-based discovery. Premium (₹249/mo) unlocks 200 daily swipes and priority messages that reach anyone directly.' },
];

export default async function NetworkingForFoundersPage() {
  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const slug = 'networking-for-founders';
  const title = 'Networking for Startup Founders';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Connect with founders, investors, and co-founders on BYN.', [{ name: 'Networking for Founders', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="The networking app built for startup founders"
        subheadline="Connect with founders actively building. Find your co-founder, first investor, or early team — matched by intent, not algorithm."
        body="Founders don't have time for LinkedIn noise. Build Your Network shows you professionals who are actively looking to collaborate, co-found, or invest — right now. Set your intent (co-founder search, hiring, investment), add your skills, and discover the right people in your city or nationwide. Unlike traditional networking apps, BYN requires mutual interest before messaging opens, so every conversation starts with genuine alignment."
        tags={['Co-founder search', 'Startup networking', 'Investor access', 'Founder community', 'Early hiring']}
        faqs={faqs}
        cta="Join India's founder network — free"
        breadcrumb={[{ label: 'Networking for Founders', href: url }]}
        stats={stats}
      />
    </>
  );
}
