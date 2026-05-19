import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ROLES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, faqSchema } from '@/lib/seo/schema';
import SeoPage from '@/components/seo/SeoPage';

interface Props { params: Promise<{ role: string }> }

export async function generateStaticParams() {
  return Object.keys(ROLES).map(role => ({ role }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  const data = ROLES[role];
  if (!data) return {};
  return buildMetadata({
    title: `Networking for ${data.name}s in India — Build Your Network`,
    description: `Build Your Network is the best professional networking platform for ${data.name}s in India. ${data.description}. Find the right people based on intent.`,
    canonical: `/roles/${role}`,
    keywords: [
      `networking for ${data.name}s India`, `${data.name} network India`,
      `${data.name} community India`, `connect with ${data.name}s`,
      `${data.name} co-founder`, `${data.name} opportunities India`,
    ],
  });
}

export default async function RolePage({ params }: Props) {
  const { role } = await params;
  const data = ROLES[role];
  if (!data) notFound();

  const stats = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } })
    .then(r => r.json())
    .catch(() => ({ users: 5000, connections: 12000 }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema(`Networking for ${data.name}s in India`, `${APP_URL}/roles/${role}`, data.description, [{ name: 'Roles', url: `${APP_URL}/roles` }, { name: data.name, url: `${APP_URL}/roles/${role}` }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(data.faqs)) }} />
      <SeoPage
        headline={`The professional network built for ${data.name}s`}
        subheadline={`${data.description} — matched by intent, skills, and shared goals on Build Your Network.`}
        body={`As a ${data.name}, the connections that matter most are with people who understand your context and are actively looking for what you bring. Build Your Network (BYN) is the only Indian professional network built on intent-based matching. Unlike LinkedIn — where everyone is present but few are relevant — BYN shows you people who are actively looking to ${data.lookingFor.slice(0, 3).join(', ').toLowerCase()}, and more. Set your role, add your skills, choose your intent, and start discovering the right people today.`}
        tags={data.lookingFor}
        faqs={data.faqs}
        cta={`Join thousands of ${data.name}s on BYN`}
        breadcrumb={[{ label: 'Roles', href: `${APP_URL}/roles` }, { label: data.name, href: `${APP_URL}/roles/${role}` }]}
        stats={stats}
      />
    </>
  );
}
