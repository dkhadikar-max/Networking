import type { Metadata } from 'next';
import { INDUSTRIES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';

export const metadata: Metadata = buildMetadata({
  title: 'Industry-Specific Professional Networking in India',
  description: 'Connect with founders, engineers, and investors in your industry — SaaS, Fintech, AI/ML, E-commerce, HealthTech, EdTech, AgriTech, and Web3. Intent-based matching on Build Your Network, free to join.',
  canonical: '/industries',
  keywords: [
    'industry networking India',
    'SaaS founder network India',
    'fintech networking India',
    'AI startup networking India',
    'startup industry connections India',
    'professional networking by industry',
  ],
});

const faqs = [
  {
    q: 'Which industries does Build Your Network cover?',
    a: 'BYN covers SaaS, Fintech, AI/ML, E-commerce, HealthTech, EdTech, AgriTech, and Web3/Crypto. Each industry has dedicated discovery pages and the community spans founders, engineers, investors, and operators across all these sectors.',
  },
  {
    q: 'How do I find professionals in my industry on BYN?',
    a: 'Add your industry interests to your BYN profile and enable discovery. BYN will surface professionals in the same sector who are actively looking for co-founders, collaborators, investors, or clients that match your intent.',
  },
  {
    q: 'Can investors find startups by industry on Build Your Network?',
    a: 'Yes. Investors can set their sector interests on BYN and filter discovery by intent "Investment Opportunities". Founders who are actively seeking investment in that industry will appear in the feed.',
  },
  {
    q: 'Is Build Your Network only for tech startups?',
    a: 'No. While BYN has a strong tech startup community, it also serves founders in HealthTech, AgriTech, EdTech, fintech, and traditional businesses looking for technical co-founders, advisors, or investors.',
  },
];

export default function IndustriesHubPage() {
  const industryEntries = Object.entries(INDUSTRIES);
  const schema = webPageSchema(
    'Industry-Specific Professional Networking in India',
    `${APP_URL}/industries`,
    'Connect with founders, engineers, and investors across SaaS, Fintech, AI/ML, HealthTech, EdTech, AgriTech, E-commerce, and Web3 on Build Your Network.',
    [{ name: 'Industries', url: `${APP_URL}/industries` }],
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <header className="border-b border-[var(--border)] bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href={APP_URL} className="font-bold text-[var(--primary)] text-lg">Build Your Network</a>
          <a href={`${APP_URL}/signup`} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-dark)] transition-colors">
            Join free →
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-14">
        <nav className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <a href={APP_URL} className="hover:text-[var(--primary)]">Home</a>
          <span>/</span>
          <span className="text-[var(--text)] font-medium">Industries</span>
        </nav>

        <section className="space-y-4 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)] leading-tight">
            Industry-Specific Professional Networking in India
          </h1>
          <p className="text-lg text-[var(--sub)] leading-relaxed">
            The right co-founder, investor, or collaborator is usually in your industry — not scattered across a generic network. Build Your Network surfaces professionals by sector so every conversation starts with shared context.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">Explore by Industry</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {industryEntries.map(([slug, industry]) => (
              <a
                key={slug}
                href={`${APP_URL}/industries/${slug}`}
                className="block rounded-xl border border-[var(--border)] bg-white p-5 hover:border-[var(--primary)] hover:shadow-md transition-all group"
              >
                <h3 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors mb-2">
                  {industry.name}
                </h3>
                <p className="text-sm text-[var(--sub)] leading-relaxed mb-3">{industry.description}</p>
                <div className="flex flex-wrap gap-1">
                  {industry.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs bg-[var(--highlight)] text-[var(--primary)] px-2 py-0.5 rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--primary)] font-medium mt-3">
                  Network in {industry.name} →
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 space-y-4 max-w-3xl">
          <h2 className="text-xl font-bold text-[var(--text)]">Why industry-specific networking matters</h2>
          <ul className="space-y-3">
            {[
              { icon: '🎯', text: 'Shared context — people in your industry understand your problems without explanation' },
              { icon: '🤝', text: 'Complementary skills — a SaaS PM needs a SaaS engineer, not a generic developer' },
              { icon: '💡', text: 'Faster validation — industry peers give better feedback than generalist networks' },
              { icon: '🔗', text: 'Warm introductions — sector connections lead to co-investors, advisors, and early customers' },
              { icon: '🆓', text: 'Free to join — BYN is free to use with 30 daily connection requests' },
            ].map(item => (
              <li key={item.icon} className="flex items-start gap-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="text-[var(--sub)] text-sm">{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-[var(--primary)] p-8 text-center text-white space-y-4 max-w-3xl">
          <h2 className="text-2xl font-bold">Find your industry network</h2>
          <p className="text-teal-100 text-sm">Free to join. No app download needed. Works in your browser.</p>
          <a
            href={`${APP_URL}/signup`}
            className="inline-block px-8 py-3 rounded-xl bg-white text-[var(--primary)] font-bold hover:bg-teal-50 transition-colors"
          >
            Get started free →
          </a>
        </section>

        <section className="space-y-4 max-w-3xl">
          <h2 className="text-xl font-bold text-[var(--text)]">Frequently asked questions</h2>
          <dl className="space-y-4">
            {faqs.map(faq => (
              <div key={faq.q} className="rounded-xl border border-[var(--border)] bg-white p-5">
                <dt className="font-semibold text-[var(--text)] mb-2">{faq.q}</dt>
                <dd className="text-sm text-[var(--sub)] leading-relaxed">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] mt-16 px-6 py-8 text-center text-sm text-[var(--muted)]">
        <p>© {new Date().getFullYear()} buildyournetwork.online ·{' '}
          <a href={`${APP_URL}/privacy`} className="hover:underline">Privacy</a>
        </p>
      </footer>
    </div>
  );
}
