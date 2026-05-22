import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Business Networking App India — Connect with Intent',
  description: 'The professional networking app that matches you by what you\'re actively looking for — not by algorithm. Meet founders, investors, and partners. Free to join.',
  canonical: '/business-networking-app',
  keywords: [
    'business networking app india', 'professional networking app', 'business networking india',
    'networking app for professionals', 'best networking app india', 'professional connection app',
  ],
});

const faqs = [
  { q: 'What makes BYN different from other business networking apps?', a: 'Most networking apps are passive directories — you build a profile and wait. BYN is an action network. Every user states their current intent (hiring, fundraising, co-founder search, partnerships, mentorship), and the app matches you with people who have the complementary intent. You only connect with people who want the same thing you do.' },
  { q: 'Who uses BYN for business networking?', a: 'Founders, investors, freelancers, startup employees, operators, consultants, creators, and senior professionals all use BYN. The common thread is that everyone on the platform is actively building something and looking to connect with the right people to move faster.' },
  { q: 'How does BYN prevent spam and low-quality connections?', a: 'BYN uses mutual-interest matching — messaging only opens after both parties express interest. Combined with trust scoring, email verification, and intent signals, the platform naturally filters for genuine connection intent. There is no mass cold-messaging.' },
  { q: 'Can I network with people outside my city on BYN?', a: 'Yes. BYN has city-based discovery by default (for in-person meetups and local collaborations) but also offers nationwide search. You can filter by location, intent, industry, and skills to find exactly the type of professional you are looking for anywhere in India.' },
  { q: 'Is BYN free to use for business networking?', a: 'Yes — 30 daily connections, mutual messaging, and city/nationwide discovery are all free. Premium (₹249/mo) gives 200 daily connections, priority messages, and advanced filters for higher-velocity networking.' },
];

export default async function BusinessNetworkingAppPage() {
  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const slug = 'business-networking-app';
  const title = 'Business Networking App India';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Professional networking app matched by intent, not algorithm.', [{ name: 'Business Networking App', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="The business networking app that matches by intent"
        subheadline="Stop collecting connections. Start making them count. BYN matches professionals by what they're actively looking for — founder, investor, or collaborator."
        body="Traditional business networking apps let you connect with anyone and then leave you to figure out why. Build Your Network works differently. Before any connection is made, both users have declared their current goals — and the app has confirmed they are complementary. Whether you are building a startup, expanding a business, or looking for your next big opportunity, BYN surfaces the exact professionals who are actively looking for what you bring. Networking with purpose."
        tags={['Intent-based networking', 'No spam connections', 'Verified professionals', 'City + nationwide', 'Startup-first']}
        faqs={faqs}
        cta="Start networking with intent — free"
        breadcrumb={[{ label: 'Business Networking App', href: url }]}
        stats={stats}
      />
    </>
  );
}
