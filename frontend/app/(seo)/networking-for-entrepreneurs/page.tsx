import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Networking for Entrepreneurs — Find Partners, Mentors & Investors',
  description: 'Connect with entrepreneurs, mentors, and investors who are actively building. BYN matches you by intent — not by follower count. Free to join.',
  canonical: '/networking-for-entrepreneurs',
  keywords: [
    'networking for entrepreneurs', 'entrepreneur network india', 'find business partner india',
    'entrepreneur community app', 'startup mentor network', 'entrepreneur to investor matching',
  ],
});

const faqs = [
  { q: 'How does BYN help entrepreneurs specifically?', a: 'BYN lets you set your current entrepreneurial intent — co-founder search, raising funds, finding a mentor, building a team, or exploring partnerships. Everyone you are matched with is actively looking for the same thing on the other side, so conversations start with genuine mutual interest.' },
  { q: 'Can I find a business partner through BYN?', a: 'Yes. Set your intent to "Find Co-founder" or "Find Partner", describe your venture and what you are building, and BYN surfaces professionals with complementary skills and goals. Matching is always mutual — both parties express interest before messaging opens.' },
  { q: 'How do I connect with mentors on BYN?', a: 'Experienced entrepreneurs and operators set their intent to "Mentoring" on BYN. Filter by industry, city, or background to find mentors who are actively looking to help. Because matching is mutual, mentors who connect with you are genuinely interested in the conversation.' },
  { q: 'Is BYN useful for solo entrepreneurs?', a: 'Especially so. Solo founders and independent entrepreneurs use BYN to build the support network they lack without a co-founder or team — finding accountability partners, advisors, early customers, and collaborators all in one place.' },
  { q: 'How much does BYN cost for entrepreneurs?', a: 'BYN is free for core networking — 30 swipes per day, mutual messaging, and city-based discovery. Premium (₹249/mo) gives 200 daily swipes and priority messages for faster outreach.' },
];

export default function NetworkingForEntrepreneursPage() {
  const slug = 'networking-for-entrepreneurs';
  const title = 'Networking for Entrepreneurs';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Find partners, mentors, and investors on BYN.', [{ name: 'Networking for Entrepreneurs', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="The network built for entrepreneurs, not employees"
        subheadline="Find co-founders, mentors, and investors who are actively looking to connect — matched by your current goal, not your job title."
        body="Most networking platforms treat entrepreneurs the same as anyone else. BYN was designed for builders. Whether you are raising your seed round, looking for a technical co-founder, seeking a mentor who has been through it, or building a partner ecosystem — BYN matches you with the right people based on what you both need right now. No cold outreach guessing games. Set your intent, get matched, start meaningful conversations."
        tags={['Co-founder matching', 'Mentor access', 'Investor network', 'Partnership discovery', 'Entrepreneur community']}
        faqs={faqs}
        cta="Join India's entrepreneur network — free"
        breadcrumb={[{ label: 'Networking for Entrepreneurs', href: url }]}
      />
    </>
  );
}
