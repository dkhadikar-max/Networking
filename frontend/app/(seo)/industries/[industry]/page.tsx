import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { INDUSTRIES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

interface Props { params: Promise<{ industry: string }> }

export async function generateStaticParams() {
  return Object.keys(INDUSTRIES).map(industry => ({ industry }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const data = INDUSTRIES[industry];
  if (!data) return {};
  return buildMetadata({
    title: `${data.name} Networking — Connect with ${data.name} Professionals`,
    description: `Build Your Network connects ${data.description} in India. Find co-founders, collaborators, and investors in ${data.name}.`,
    canonical: `/industries/${industry}`,
    keywords: [
      `${data.name} networking India`, `${data.name} founders India`,
      `${data.name} co-founder`, `${data.name} professionals network`,
      `connect with ${data.name} founders`,
    ],
  });
}

export default async function IndustryPage({ params }: Props) {
  const { industry } = await params;
  const data = INDUSTRIES[industry];
  if (!data) notFound();

  const defaultFaqs = [
    { q: `How do I find ${data.name} co-founders on Build Your Network?`, a: `Create a free profile, add ${data.name} and related skills, set your intent to "Find Co-founder", and enable discovery. BYN matches you with complementary ${data.name} builders based on your goals.` },
    { q: `Can I find ${data.name} investors on BYN?`, a: `Yes. Set intent to "Investment Opportunities" on BYN to surface angel investors and VCs actively looking for ${data.name} deals in India.` },
  ];

  const faqs = data.faqs.length > 0 ? data.faqs : defaultFaqs;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(`${data.name} Networking in India`, `${APP_URL}/industries/${industry}`, `Connect with ${data.description} on BYN.`, [{ name: 'Industries', url: `${APP_URL}/industries` }, { name: data.name, url: `${APP_URL}/industries/${industry}` }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />
      <SeoPage
        headline={`Connect with ${data.name} founders and professionals`}
        subheadline={`Build Your Network connects ${data.description} across India. Find co-founders, collaborators, and investors — matched by intent, not just keywords.`}
        body={`The ${data.name} space in India is growing fast. Build Your Network (BYN) is the only professional networking platform built specifically for intent-based matching — you see people who are actively looking for what you offer. Whether you are building in ${data.name}, investing in it, or looking for a co-founder with complementary skills, BYN surfaces the right connections without the noise of generic networks.`}
        tags={data.tags}
        faqs={faqs}
        cta={`Join the ${data.name} community on BYN`}
        breadcrumb={[{ label: 'Industries', href: `${APP_URL}/industries` }, { label: data.name, href: `${APP_URL}/industries/${industry}` }]}
      />
    </>
  );
}
