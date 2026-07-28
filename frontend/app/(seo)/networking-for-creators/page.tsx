import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

export const metadata: Metadata = buildMetadata({
  title: 'Networking for Creators — Collaborate, Brand Deals & Community',
  description: 'Connect with creators, brands, and collaborators actively looking to work together. BYN matches you by intent — not follower count. Free to join.',
  canonical: '/networking-for-creators',
  keywords: [
    'networking for creators', 'creator collaboration app', 'brand deals for creators india',
    'content creator network india', 'creator community app', 'find brand partnerships india',
  ],
});

const faqs = [
  { q: 'How does BYN help content creators?', a: 'BYN lets creators set their intent to "Collaborating" or "Brand Partnerships" to surface in front of brands and fellow creators actively looking to work together. Unlike Instagram DMs or cold emails, every connection on BYN starts with mutual interest — both parties have expressed a match before messaging opens.' },
  { q: 'Can I find brand deal opportunities on BYN?', a: 'Yes. Brands and marketing professionals on BYN set their intent to "Partnerships" and discover creators by niche, location, and interest. If you are a creator, set your intent to "Brand Partnerships" to appear in those searches — no follower minimum required.' },
  { q: 'Is BYN useful for small creators?', a: 'Especially for emerging creators. BYN does not rank by follower count — it matches by intent and interest alignment. A 2,000-follower creator with the right niche can connect with a brand looking for authentic micro-influencers just as easily as a large creator.' },
  { q: 'Can I find creative collaborators on BYN?', a: 'Yes. Videographers, editors, photographers, writers, and other creatives use BYN to find project partners. Set your skills and what you are currently working on — BYN surfaces professionals who complement your stack and want to collaborate.' },
  { q: 'Is BYN free for creators?', a: 'Yes — 30 daily swipes, mutual messaging, and city-based discovery are free. Premium (₹249/mo) unlocks 200 daily swipes and priority messages to reach anyone directly.' },
];

export default function NetworkingForCreatorsPage() {
  const slug = 'networking-for-creators';
  const title = 'Networking for Creators';
  const url = `${APP_URL}/${slug}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(title, url, 'Find collaborators and brand partners on BYN.', [{ name: 'Networking for Creators', url }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline="Where creators find real collaborators and brand partners"
        subheadline="Connect with brands, fellow creators, and collaborators who are actively looking to work with you — matched by niche and intent, not follower count."
        body="Follower count is the wrong metric for collaboration. Build Your Network matches creators with brands, co-creators, and collaborators based on what you are actively building and what partners are actively seeking. No cold DMs. No gatekeeping by subscriber numbers. Set your creative intent, add your niche and skills, and meet professionals who want exactly what you bring to the table — whether you have 500 followers or 500,000."
        tags={['Brand partnerships', 'Creative collaboration', 'Micro-influencer discovery', 'Content creator network', 'Niche matching']}
        faqs={faqs}
        cta="Join BYN as a creator — free"
        breadcrumb={[{ label: 'Networking for Creators', href: url }]}
      />
    </>
  );
}
