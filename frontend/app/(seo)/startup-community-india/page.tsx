import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Startup Community India — Connect with Founders & Builders',
  description: 'Join India\'s startup community on BYN. Meet founders, engineers, investors, and early-stage builders matched by intent. Active in Bangalore, Mumbai, Delhi, Hyderabad.',
  canonical: '/startup-community-india',
  keywords: [
    'startup community india', 'startup network india', 'startup founders india',
    'bangalore startup community', 'india startup ecosystem', 'startup networking app india',
  ],
});

const faqs = [
  { q: 'Which cities is BYN\'s startup community active in?', a: 'BYN has active communities in Bangalore, Mumbai, Delhi, Hyderabad, Pune, Chennai, Kolkata, and other major Indian cities. Location-based discovery means you can find founders and builders within your city for coffee chats and in-person collaboration as well as nationwide connections.' },
  { q: 'What kind of startups are on BYN?', a: 'BYN has founders across stages — idea stage to Series A — and across sectors including SaaS, fintech, edtech, D2C, climate, healthcare, and deep tech. Founders, engineers, designers, operators, and investors all use BYN as their professional action network.' },
  { q: 'Is BYN an Indian startup itself?', a: 'Yes. Build Your Network was built in India for the Indian startup ecosystem. We understand the specific dynamics of Indian fundraising, co-founder culture, and city-based communities — and the product reflects that.' },
  { q: 'How do I find co-founders in India through BYN?', a: 'Set your intent to "Find Co-founder", add your background and what you are building, and BYN surfaces founders with complementary skills in your city or nationwide. Matching is mutual — both parties express interest before messaging opens — so you never cold-pitch someone who is not interested.' },
  { q: 'Is BYN free for startup community members?', a: 'Yes. Core features — 30 daily connections, mutual messaging, and city-based discovery — are free. Premium (₹249/mo) unlocks 200 daily connections and priority messages for faster outreach across the community.' },
];

export default async function StartupCommunityIndiaPage() {
  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const slug = 'startup-community-india';
  const title = 'Startup Community India';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'India\'s startup community — connect with founders and builders.', [{ name: 'Startup Community India', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="India's startup community — built by founders, for founders"
        subheadline="Connect with founders, engineers, investors, and builders actively working on the next big thing. Active in Bangalore, Mumbai, Delhi, Hyderabad, and beyond."
        body="India's startup ecosystem is the third largest in the world — but finding the right person in it still depends too much on who you went to college with. Build Your Network changes that. BYN is an intent-driven community where founders, engineers, designers, investors, and operators across India state what they are building and what they need. The right co-founder, early hire, or investor is in the community — BYN surfaces them based on mutual fit, not social proximity."
        tags={['Founder community', 'Bangalore startups', 'Mumbai tech', 'India ecosystem', 'Stage-agnostic']}
        faqs={faqs}
        cta="Join India's startup community — free"
        breadcrumb={[{ label: 'Startup Community India', href: url }]}
        stats={stats}
      />
    </>
  );
}
