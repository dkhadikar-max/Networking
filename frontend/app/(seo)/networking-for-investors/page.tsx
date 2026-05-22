import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Networking for Investors — Discover Founders & Deals in India',
  description: 'Find early-stage founders actively seeking investment on BYN. Intent-based matching surfaces the right founders — no cold emails, no pitch decks sent to the void.',
  canonical: '/networking-for-investors',
  keywords: [
    'networking for investors india', 'angel investor network india', 'find startups to invest india',
    'investor founder matching', 'early stage deals india', 'vc network india',
  ],
});

const faqs = [
  { q: 'How does BYN help investors find deal flow?', a: 'Investors set their intent to "Investing" on BYN and immediately surface in front of founders actively seeking funding. Founders who set their intent to "Looking for Investment" are surfaced directly to investors — creating a warm, intent-verified pipeline without cold emails or intermediaries.' },
  { q: 'What stage of startups can I find on BYN?', a: 'BYN has founders across stages — from pre-product idea stage to Series A. Most activity is concentrated at pre-seed and seed stage where founder networks matter most. You can filter by city, industry, and specific skills to refine the pipeline you see.' },
  { q: 'Is BYN useful for angel investors?', a: 'Particularly useful. Angel investors use BYN to surface deal flow from local ecosystems (Bangalore, Mumbai, Delhi, Hyderabad) where geography still matters for early stage investing. Intent matching means you only see founders actively raising — not passive profiles.' },
  { q: 'Can investors use BYN to build co-investor networks?', a: 'Yes. Many investors use BYN to connect with other angels and early-stage funds for syndication, co-investment, and deal sharing. Set your intent to "Networking" alongside "Investing" to surface both founders and fellow investors simultaneously.' },
  { q: 'Is BYN free for investors?', a: 'Yes — basic discovery, mutual messaging, and city-based search are free. Premium (₹249/mo) unlocks 200 daily swipes and priority messages to reach founders directly without waiting for a mutual match.' },
];

export default async function NetworkingForInvestorsPage() {
  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const slug = 'networking-for-investors';
  const title = 'Networking for Investors';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Discover founders actively seeking investment on BYN.', [{ name: 'Networking for Investors', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="Find founders actively seeking investment — no cold emails"
        subheadline="BYN surfaces early-stage founders who are actively raising, matched to investors who are actively deploying. Warm deal flow, no intermediaries."
        body="Deal flow discovery is broken. Cold emails get ignored. Intros depend on who you know. Build Your Network creates a new channel: founders who are actively raising set their intent on BYN, and investors who are actively deploying set theirs. The platform matches them by intent, location, industry, and stage — so every conversation starts with genuine alignment. No pitch decks sent to the void. No cold outreach. Just warm, intent-verified connections with founders who are building right now."
        tags={['Warm deal flow', 'Intent-verified founders', 'Early stage', 'Angel + VC', 'India ecosystem']}
        faqs={faqs}
        cta="Discover Indian founders — join BYN free"
        breadcrumb={[{ label: 'Networking for Investors', href: url }]}
        stats={stats}
      />
    </>
  );
}
