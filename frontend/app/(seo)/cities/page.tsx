import type { Metadata } from 'next';
import { CITIES, APP_URL } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';

export const metadata: Metadata = buildMetadata({
  title: 'Professional Networking in Indian Cities',
  description: 'Discover and connect with founders, freelancers, and professionals in your city. Build Your Network covers 25+ Indian cities with intent-based matching — Bengaluru, Mumbai, Hyderabad, Delhi, Pune, and more.',
  canonical: '/cities',
  keywords: [
    'professional networking India',
    'startup networking cities India',
    'connect with professionals in India',
    'networking app Indian cities',
    'founder network India',
  ],
});

const faqs = [
  {
    q: 'Which cities does Build Your Network cover?',
    a: 'Build Your Network covers 25+ major Indian cities including Bengaluru, Mumbai, Hyderabad, Delhi NCR, Pune, Chennai, Kolkata, Ahmedabad, Jaipur, Kochi, Gurgaon, Noida, Chandigarh, Coimbatore, Surat, Visakhapatnam, Indore, Nagpur, Lucknow, Bhopal, Thiruvananthapuram, Mysuru, Kota, and more.',
  },
  {
    q: 'Can I network with professionals in multiple cities?',
    a: 'Yes. You can set your discovery to Nationwide or Worldwide to connect with professionals across all Indian cities, or narrow to a specific radius (10–200 km) around your current city.',
  },
  {
    q: 'Is Build Your Network available in Tier 2 cities?',
    a: 'Yes. BYN has active communities in Tier 2 cities including Jaipur, Kochi, Coimbatore, Surat, Indore, Nagpur, Lucknow, Visakhapatnam, Chandigarh, Kota, and many more.',
  },
  {
    q: 'How does location-based networking work on BYN?',
    a: 'BYN uses GPS to show professionals within your chosen radius. You can discover people within 10 km for hyper-local co-founder meetings, or 200 km+ for broader regional connections. Premium users unlock tighter distance filters.',
  },
];

export default function CitiesHubPage() {
  const cityEntries = Object.entries(CITIES);
  const schema = webPageSchema(
    'Professional Networking in Indian Cities',
    `${APP_URL}/cities`,
    'Discover and connect with founders, freelancers, and professionals in your city on Build Your Network.',
    [{ name: 'Cities', url: `${APP_URL}/cities` }],
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
          <span className="text-[var(--text)] font-medium">Cities</span>
        </nav>

        <section className="space-y-4 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)] leading-tight">
            Professional Networking Across Indian Cities
          </h1>
          <p className="text-lg text-[var(--sub)] leading-relaxed">
            Build Your Network connects founders, freelancers, engineers, mentors, and investors in 25+ Indian cities through intent-based matching. Find the right professionals in your city — or go nationwide.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">Explore by City</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cityEntries.map(([slug, city]) => (
              <a
                key={slug}
                href={`${APP_URL}/cities/${slug}`}
                className="block rounded-xl border border-[var(--border)] bg-white p-5 hover:border-[var(--primary)] hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                    {city.name}
                  </h3>
                  <span className="text-xs text-[var(--muted)] bg-[var(--sur2)] px-2 py-0.5 rounded-full shrink-0 ml-2">
                    {city.state}
                  </span>
                </div>
                <p className="text-sm text-[var(--sub)] leading-relaxed line-clamp-2">{city.excerpt}</p>
                <p className="text-xs text-[var(--primary)] font-medium mt-3">
                  Network in {city.name} →
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 space-y-4 max-w-3xl">
          <h2 className="text-xl font-bold text-[var(--text)]">Why network by city on BYN?</h2>
          <ul className="space-y-3">
            {[
              { icon: '📍', text: 'GPS-based matching — find professionals within 10–200 km for in-person meetings' },
              { icon: '🎯', text: 'Intent-first discovery — see people actively looking for co-founders, clients, mentors, or collaborators' },
              { icon: '🤝', text: 'Mutual interest model — messaging only opens when both sides express interest' },
              { icon: '🆓', text: 'Free to join — start discovering local professionals at no cost' },
              { icon: '🌐', text: 'Go national — switch to Nationwide or Worldwide when your city isn\'t enough' },
            ].map(item => (
              <li key={item.icon} className="flex items-start gap-3">
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="text-[var(--sub)] text-sm">{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-[var(--primary)] p-8 text-center text-white space-y-4 max-w-3xl">
          <h2 className="text-2xl font-bold">Start networking in your city</h2>
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
