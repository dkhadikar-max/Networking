import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — Build Your Network',
  description: 'Get in touch with Build Your Network for support, privacy questions, or to follow our progress.',
};

const SUPPORT_EMAIL = 'support@buildyournetwork.online';
const PRIVACY_EMAIL = 'privacy@buildyournetwork.online';

const SOCIAL_LINKS = [
  { label: 'Twitter / X', href: 'https://twitter.com/buildyournetwork' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/build-your-network' },
  { label: 'Product Hunt', href: 'https://www.producthunt.com/products/build-your-network' },
  { label: 'Wellfound', href: 'https://wellfound.com/company/build-your-network' },
  { label: 'Crunchbase', href: 'https://www.crunchbase.com/organization/build-your-network' },
  { label: 'Indie Hackers', href: 'https://www.indiehackers.com/product/build-your-network' },
];

export default function ContactPage() {
  return (
    <article className="prose prose-sm max-w-none text-[var(--text)]">
      <h1 className="text-3xl font-bold text-[var(--text)] mb-2">Contact Us</h1>
      <p className="text-[var(--muted)] text-sm mb-8">We usually respond within a few business days.</p>

      <Section title="General support">
        <p>Questions about your account, a bug report, or anything else &mdash; email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--primary)]">{SUPPORT_EMAIL}</a>.</p>
      </Section>

      <Section title="Privacy questions">
        <p>For data access, deletion, or other privacy requests, email <a href={`mailto:${PRIVACY_EMAIL}`} className="text-[var(--primary)]">{PRIVACY_EMAIL}</a>, or see our <a href="/privacy" className="text-[var(--primary)]">Privacy Policy</a>.</p>
      </Section>

      <Section title="Follow our progress">
        <ul>
          {SOCIAL_LINKS.map((s) => (
            <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)]">{s.label}</a></li>
          ))}
        </ul>
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
