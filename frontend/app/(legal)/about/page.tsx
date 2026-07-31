import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Build Your Network',
  description: 'Build Your Network (BYN) is a free, intent-based professional networking platform founded in India in 2024, connecting founders, freelancers, and creators by what they’re looking for.',
};

export default function AboutPage() {
  return (
    <article className="prose prose-sm max-w-none text-[var(--text)]">
      <h1 className="text-3xl font-bold text-[var(--text)] mb-2">About Build Your Network</h1>
      <p className="text-[var(--muted)] text-sm mb-8">Founded 2024 &middot; India</p>

      <Section title="Our mission">
        <p>Most professional networks show you who people are &mdash; their title, their company, their headline. Build Your Network (BYN) shows you what people want. Every profile declares a clear intent: looking for a co-founder, open to freelance work, available to mentor, raising or investing. We built BYN because the most useful professional connections start with a shared purpose, not a shared job title.</p>
      </Section>

      <Section title="What we believe">
        <ul>
          <li><strong>No spam.</strong> No bulk outreach, no random connection requests &mdash; only intentional, relevant ones.</li>
          <li><strong>No ads.</strong> Your attention isn&apos;t our product. We don&apos;t sell impressions.</li>
          <li><strong>No data selling.</strong> Your profile data stays yours. We don&apos;t share, sell, or monetize it. See our <Link href="/privacy" className="text-[var(--primary)]">Privacy Policy</Link> for details.</li>
        </ul>
      </Section>

      <Section title="What makes BYN different">
        <ul>
          <li><strong>Intent-based discovery.</strong> You discover people based on shared purpose, not shared connections or job titles.</li>
          <li><strong>Trust score.</strong> Every profile carries a transparent trust score based on verification depth, connection quality, and community feedback.</li>
          <li><strong>Relevance over volume.</strong> We optimize for the quality of a connection, not the size of a network.</li>
        </ul>
      </Section>

      <Section title="Who BYN is for">
        <p>Startup founders looking for co-founders, mentors, or angel investors. Freelancers looking for clients. Creators and operators looking for collaborators. Angel investors building deal flow. Anyone who wants a professional connection grounded in an actual, stated reason.</p>
      </Section>

      <Section title="Where we operate">
        <p>BYN launched India-first and supports founders and entrepreneurs across every major Indian city, with GPS-based discovery from 10 km to nationwide. We&apos;ve since expanded to international hubs across the United States, United Kingdom, Europe, and beyond, for founders connecting with India-based technical co-founders and operators.</p>
      </Section>

      <Section title="Get in touch">
        <p>Questions, feedback, or partnership enquiries &mdash; visit our <Link href="/contact" className="text-[var(--primary)]">Contact page</Link>.</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-[var(--text)] mb-3 mt-8">{title}</h2>
      <div className="text-[var(--sub)] space-y-3 leading-relaxed text-sm">{children}</div>
    </section>
  );
}
