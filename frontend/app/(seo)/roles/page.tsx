import type { Metadata } from 'next';
import { ROLES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';

export const metadata: Metadata = buildMetadata({
  title: 'Professional Networking by Role in India',
  description: 'Whether you are a founder, engineer, designer, investor, or freelancer — Build Your Network connects you with the right professionals based on what you are actively looking for. Intent-based matching, free to join.',
  canonical: '/roles',
  keywords: [
    'professional networking by role India',
    'founder network India',
    'software engineer networking India',
    'designer networking India',
    'investor network India',
    'freelancer network India',
  ],
});

const faqs = [
  {
    q: 'Which professional roles does Build Your Network support?',
    a: 'BYN supports founders, product managers, software engineers, designers, growth marketers, investors, mentors, and freelancers. Every role has a dedicated discovery experience matched to what that role is actually looking for.',
  },
  {
    q: 'How does role-based networking work on BYN?',
    a: 'You declare your role and what you are looking for when you create a profile. BYN then surfaces professionals whose roles and intents complement yours — a founder looking for co-founders sees engineers and designers looking to co-found, not job-seekers.',
  },
  {
    q: 'Can I connect with multiple professional roles at once?',
    a: 'Yes. Your discovery feed shows all roles by default. You can filter by specific intent (Find Co-founder, Find Clients, etc.) or browse across all roles to find the mix that fits your current goals.',
  },
  {
    q: 'Is Build Your Network only for senior professionals?',
    a: 'No. BYN is for professionals at every career stage — from first-time founders to serial entrepreneurs, from junior freelancers to senior engineers. The intent-based model works regardless of experience level.',
  },
];

export default function RolesHubPage() {
  const roleEntries = Object.entries(ROLES);
  const schema = webPageSchema(
    'Professional Networking by Role in India',
    `${APP_URL}/roles`,
    'Connect with founders, engineers, designers, investors, mentors, and freelancers through intent-based matching on Build Your Network.',
    [{ name: 'Roles', url: `${APP_URL}/roles` }],
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
          <span className="text-[var(--text)] font-medium">Roles</span>
        </nav>

        <section className="space-y-4 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)] leading-tight">
            Professional Networking for Every Role
          </h1>
          <p className="text-lg text-[var(--sub)] leading-relaxed">
            Founders need co-founders. Engineers want to build. Freelancers need clients. Investors need deal flow. Build Your Network surfaces the right people for each role — matched by declared intent, not job title.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">Explore by Role</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roleEntries.map(([slug, role]) => (
              <a
                key={slug}
                href={`${APP_URL}/roles/${slug}`}
                className="block rounded-xl border border-[var(--border)] bg-white p-5 hover:border-[var(--primary)] hover:shadow-md transition-all group"
              >
                <h3 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors mb-2">
                  {role.name}
                </h3>
                <p className="text-sm text-[var(--sub)] leading-relaxed mb-3">{role.description}</p>
                <div className="flex flex-wrap gap-1">
                  {role.lookingFor.slice(0, 3).map(item => (
                    <span key={item} className="text-xs bg-[var(--highlight)] text-[var(--primary)] px-2 py-0.5 rounded-full font-medium">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--primary)] font-medium mt-3">
                  Network as {role.name} →
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 space-y-4 max-w-3xl">
          <h2 className="text-xl font-bold text-[var(--text)]">Why Build Your Network for professionals?</h2>
          <ul className="space-y-3">
            {[
              { icon: '🎯', text: 'Intent-based matching — every person you see has declared what they are looking for' },
              { icon: '🚫', text: 'No recruiter spam — BYN is not a job board, it\'s a professional connection platform' },
              { icon: '🤝', text: 'Mutual interest model — conversations start only when both sides are interested' },
              { icon: '📍', text: 'Local + nationwide — find professionals nearby or across India' },
              { icon: '🆓', text: 'Free to join — 30 daily connection requests at no cost' },
            ].map(item => (
              <li key={item.icon} className="flex items-start gap-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="text-[var(--sub)] text-sm">{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-[var(--primary)] p-8 text-center text-white space-y-4 max-w-3xl">
          <h2 className="text-2xl font-bold">Join India's professional network</h2>
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
