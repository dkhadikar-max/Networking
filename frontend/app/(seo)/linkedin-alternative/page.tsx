import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'LinkedIn Alternative for Professionals in India',
  description: 'Tired of LinkedIn noise? Build Your Network matches professionals by intent — not algorithm. Meet people actively looking to collaborate, hire, or invest. Free.',
  canonical: '/linkedin-alternative',
  keywords: [
    'linkedin alternative india', 'professional networking app india', 'better than linkedin',
    'linkedin alternative for founders', 'networking app without linkedin', 'professional networking without linkedin',
  ],
});

const faqs = [
  { q: 'Why do professionals look for LinkedIn alternatives?', a: 'LinkedIn is built around passive profiles and job listings. Most professionals tire of algorithm-driven feeds, cold InMails, and recruiter spam. BYN is an action network — every user states what they are actively looking for right now, so every connection has purpose before the first message.' },
  { q: 'How is BYN different from LinkedIn?', a: 'BYN uses intent-based matching. Instead of broadcasting your resume, you set your current goal — co-founder search, hiring, fundraising, collaboration, or mentorship. You only appear to people who want what you offer, and vice versa. No recruiters, no spam, no passive scrolling.' },
  { q: 'Can I find jobs or hire through BYN?', a: 'Yes. Professionals set their intent to "Open to Opportunities" and surface in searches by founders and teams actively hiring. Similarly, founders and startups set their intent to "Hiring" and discover relevant candidates by skill, location, and interest.' },
  { q: 'Is BYN only for India?', a: 'BYN started in India and has its strongest community in Bangalore, Mumbai, Delhi, Hyderabad, and Pune. It is growing internationally — but if you are in India, BYN\'s local density makes it significantly more useful than LinkedIn for finding people near you who want to connect in person.' },
  { q: 'Is BYN free to use?', a: 'Yes — 30 daily swipes, direct messaging after matching, and city-based discovery are all free. Premium (₹249/mo) unlocks 200 daily swipes and priority messages that bypass the match requirement.' },
];

export default function LinkedinAlternativePage() {
  const slug = 'linkedin-alternative';
  const title = 'LinkedIn Alternative for Professionals in India';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Intent-based professional networking — not LinkedIn noise.', [{ name: 'LinkedIn Alternative', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="Professional networking that actually works — unlike LinkedIn"
        subheadline="Match with founders, investors, and professionals by what you're actively looking for — not by who has the shiniest profile."
        body="LinkedIn was built for recruiters, not professionals. The feed is noise, cold messages get ignored, and your connections mean nothing. Build Your Network flips the model: you state your intent, we match you with people who have the same goal. Every profile shows what someone is building and what they need right now — so when you connect, there is already alignment. No cold InMails. No recruiter spam. Just the right people, at the right time."
        tags={['Intent-based matching', 'No recruiter spam', 'Startup-first', 'Founder community', 'Action network']}
        faqs={faqs}
        cta="Try BYN free — no LinkedIn noise"
        breadcrumb={[{ label: 'LinkedIn Alternative', href: url }]}
      />
    </>
  );
}
