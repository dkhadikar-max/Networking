import { APP_URL } from '@/lib/seo/data';

interface Faq { q: string; a: string }

interface Props {
  headline: string;
  subheadline: string;
  body: string;
  tags?: string[];
  faqs: Faq[];
  cta?: string;
  breadcrumb: { label: string; href: string }[];
  stats?: { users: number; connections: number };
}

export default function SeoPage({ headline, subheadline, body, tags, faqs, cta, breadcrumb, stats }: Props) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Nav */}
      <header className="border-b border-[var(--border)] bg-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href={APP_URL} className="font-bold text-[var(--primary)] text-lg">BYN</a>
          <a
            href={`${APP_URL}/webapp.html`}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-dark)] transition-colors"
          >
            Join free →
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <a href={APP_URL} className="hover:text-[var(--primary)]">Home</a>
          {breadcrumb.map(b => (
            <span key={b.href} className="flex items-center gap-2">
              <span>/</span>
              <a href={b.href} className="hover:text-[var(--primary)]">{b.label}</a>
            </span>
          ))}
        </nav>

        {/* Hero */}
        <section className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)] leading-tight">
            {headline}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed">{subheadline}</p>

          {stats && (
            <div className="flex gap-6 py-4">
              <div>
                <p className="text-2xl font-bold text-[var(--primary)]">{stats.users.toLocaleString()}+</p>
                <p className="text-sm text-[var(--text-muted)]">professionals</p>
              </div>
              <div className="w-px bg-[var(--border)]" />
              <div>
                <p className="text-2xl font-bold text-[var(--primary)]">{stats.connections.toLocaleString()}+</p>
                <p className="text-sm text-[var(--text-muted)]">connections made</p>
              </div>
              <div className="w-px bg-[var(--border)]" />
              <div>
                <p className="text-2xl font-bold text-[var(--primary)]">Free</p>
                <p className="text-sm text-[var(--text-muted)]">to join</p>
              </div>
            </div>
          )}

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="px-3 py-1 rounded-full bg-[var(--highlight)] text-[var(--primary)] text-sm font-medium">
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Body */}
        <section className="prose prose-slate max-w-none">
          <p className="text-[var(--text-secondary)] leading-relaxed text-base">{body}</p>
        </section>

        {/* Why BYN */}
        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 space-y-4">
          <h2 className="text-xl font-bold text-[var(--text)]">Why Build Your Network?</h2>
          <ul className="space-y-3">
            {[
              { icon: '🎯', text: 'Intent-based matching — connect with people actively looking for the same thing you are' },
              { icon: '📍', text: 'Discover by location, skills, or industry — from your city or nationwide' },
              { icon: '🤝', text: 'Real connections, not cold messages — mutual swipe before messaging starts' },
              { icon: '🆓', text: 'Free to join — no subscription needed to start discovering people' },
              { icon: '⚡', text: 'Works in your browser — no app download required to get started' },
            ].map(item => (
              <li key={item.icon} className="flex items-start gap-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="text-[var(--text-secondary)] text-sm">{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="rounded-2xl bg-[var(--primary)] p-8 text-center text-white space-y-4">
          <h2 className="text-2xl font-bold">{cta ?? 'Join the network'}</h2>
          <p className="text-teal-100 text-sm">Free to join. No app download needed.</p>
          <a
            href={`${APP_URL}/webapp.html`}
            className="inline-block px-8 py-3 rounded-xl bg-white text-[var(--primary)] font-bold hover:bg-teal-50 transition-colors"
          >
            Get started free →
          </a>
        </section>

        {/* FAQ */}
        {faqs.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text)]">Frequently asked questions</h2>
            <dl className="space-y-4">
              {faqs.map(faq => (
                <div key={faq.q} className="rounded-xl border border-[var(--border)] bg-white p-5">
                  <dt className="font-semibold text-[var(--text)] mb-2">{faq.q}</dt>
                  <dd className="text-sm text-[var(--text-secondary)] leading-relaxed">{faq.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--border)] mt-16 px-6 py-8 text-center text-sm text-[var(--text-muted)]">
        <p>© {new Date().getFullYear()} {APP_URL.replace('https://', '')} · <a href={`${APP_URL}/privacy.html`} className="hover:underline">Privacy</a></p>
      </footer>
    </div>
  );
}
