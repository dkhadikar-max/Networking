import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Networking for Freelancers — Find Clients & Collaborators in India',
  description: 'Connect with startups, founders, and professionals actively hiring freelancers. BYN matches by intent — not by platform fee. Free to join.',
  canonical: '/networking-for-freelancers',
  keywords: [
    'networking for freelancers india', 'find freelance clients india', 'freelancer community india',
    'freelance network app', 'connect with startups as freelancer', 'freelance collaboration india',
  ],
});

const faqs = [
  { q: 'How does BYN help freelancers find clients?', a: 'On BYN, startups and founders set their intent to "Hiring" and discover freelancers by skill and location. Freelancers set their intent to "Open to Work" or "Freelancing" so they surface in those searches. Matching is mutual — both sides express interest before messaging opens, so every conversation is warm.' },
  { q: 'Is BYN only for tech freelancers?', a: 'No. BYN has designers, writers, marketers, videographers, photographers, consultants, and domain experts alongside engineers and developers. Set your skills accurately and you will match with clients looking for exactly your background.' },
  { q: 'How is BYN different from Upwork or Freelancer.com?', a: 'Upwork and Freelancer are marketplace platforms with fees, bidding wars, and algorithm-ranked profiles. BYN is a professional network — you connect directly with founders and teams, build relationships, and work without platform commissions or gig fees.' },
  { q: 'Can I find long-term clients through BYN?', a: 'Yes. Many freelancers use BYN specifically to find anchor clients — startups that need ongoing design, development, or marketing support. Because you are connecting with founders directly, conversations about retainers and longer engagements happen naturally.' },
  { q: 'Is BYN free for freelancers?', a: 'Yes — 30 daily connections, mutual messaging, and location-based discovery are free. Premium (₹249/mo) unlocks 200 daily connections and priority messages so you can reach clients directly without waiting for a match.' },
];

export default async function NetworkingForFreelancersPage() {
  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  const slug = 'networking-for-freelancers';
  const title = 'Networking for Freelancers';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Find clients and collaborators without platform fees.', [{ name: 'Networking for Freelancers', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="Find freelance clients without platform fees or bidding wars"
        subheadline="Connect directly with startups and founders actively hiring freelancers — matched by your skills and what they need right now."
        body="Upwork takes 20%. Freelancer.com buries you in bids. BYN works differently. Freelancers join a professional network where startups and founders actively look for skilled people by name. Set your freelancing intent and skills, and appear directly in searches by the exact type of client you want to work with — without commissions, bidding, or middlemen. Every conversation starts because both sides are genuinely interested."
        tags={['Direct client access', 'No platform fees', 'Startup clients', 'Skill-based matching', 'Freelance community']}
        faqs={faqs}
        cta="Find your next client on BYN — free"
        breadcrumb={[{ label: 'Networking for Freelancers', href: url }]}
        stats={stats}
      />
    </>
  );
}
