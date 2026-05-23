import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Build Your Network',
  description: 'How Build Your Network collects, uses, and protects your personal data.',
};

const LAST_UPDATED = 'May 21, 2026';
const CONTACT_EMAIL = 'privacy@buildyournetwork.online';

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm max-w-none text-[var(--text)]">
      <h1 className="text-3xl font-bold text-[var(--text)] mb-2">Privacy Policy</h1>
      <p className="text-[var(--muted)] text-sm mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="1. Who we are">
        <p>Build Your Network ({'“'}BYN{'”'}, {'“'}we{'”'}, {'“'}us{'”'}) is an intent-based professional networking platform operated from India. Our registered contact for privacy matters is <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--primary)]">{CONTACT_EMAIL}</a>.</p>
      </Section>

      <Section title="2. What data we collect">
        <ul>
          <li><strong>Account data:</strong> name, email address, hashed password, and the date you created your account.</li>
          <li><strong>Profile data:</strong> bio, headline, profession, location (city name), skills, interests, photos, LinkedIn/Instagram/website URLs, and what you are working on.</li>
          <li><strong>Location data:</strong> approximate GPS coordinates (rounded to ~1 km) if you enable location-based discovery. We never collect precise real-time location.</li>
          <li><strong>Usage data:</strong> connection requests you send, messages you exchange, profiles you view, and your last-active timestamp.</li>
          <li><strong>Acquisition data:</strong> how you heard about us (e.g. LinkedIn, referral) — collected once during onboarding.</li>
          <li><strong>Payment data:</strong> plan type, currency, and Razorpay order/payment IDs. We do not store card numbers — Razorpay handles card processing.</li>
          <li><strong>Device data:</strong> push notification tokens (if you enable notifications). We do not collect device fingerprints or advertising IDs.</li>
        </ul>
      </Section>

      <Section title="3. Why we process your data">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
              <th className="text-left py-2 font-semibold">Legal basis (GDPR)</th>
            </tr>
          </thead>
          <tbody className="text-[var(--sub)]">
            {[
              ['Provide the platform and match you with other users', 'Contract (Art. 6.1.b)'],
              ['Verify your email address', 'Contract (Art. 6.1.b)'],
              ['Send transactional emails (OTP, receipts, deletion warnings)', 'Contract (Art. 6.1.b)'],
              ['Process payments and prevent fraud', 'Contract + Legitimate interest (Art. 6.1.b, 6.1.f)'],
              ['Analyse aggregate platform usage to improve the product', 'Legitimate interest (Art. 6.1.f)'],
              ['Analytics tracking (Google Analytics) — only with consent', 'Consent (Art. 6.1.a)'],
              ['Send marketing emails — only with consent', 'Consent (Art. 6.1.a)'],
              ['Comply with legal obligations', 'Legal obligation (Art. 6.1.c)'],
            ].map(([p, b]) => (
              <tr key={p} className="border-b border-[var(--border)]">
                <td className="py-2 pr-4">{p}</td>
                <td className="py-2">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="4. Cookies and tracking">
        <p>We use a cookie (<code>byn_consent</code>) to store your cookie preference. If you accept analytics cookies, we load Google Analytics (G-5NQDBYG4CJ) which sets its own cookies and collects anonymised usage data. You can withdraw consent at any time using the cookie settings link in the app footer.</p>
        <p>We do not use advertising cookies, tracking pixels, or third-party retargeting.</p>
      </Section>

      <Section title="5. Who we share your data with">
        <p>We share data only with the vendors listed below, each under a data processing agreement:</p>
        <ul>
          <li><strong>Supabase</strong> (database hosting, EU/US region) — stores all user data.</li>
          <li><strong>Cloudinary</strong> (media storage) — stores profile photos.</li>
          <li><strong>Resend</strong> (transactional email) — sends OTP, receipts, and system emails.</li>
          <li><strong>Razorpay</strong> (payments, India) — processes premium subscriptions.</li>
          <li><strong>Expo</strong> (push notifications) — delivers in-app notifications.</li>
          <li><strong>Google Analytics</strong> (analytics, consent-gated) — aggregated usage stats.</li>
          <li><strong>Railway</strong> (hosting) — runs the application server.</li>
        </ul>
        <p>We do not sell your personal data to any third party.</p>
      </Section>

      <Section title="6. Your rights">
        <p>Depending on your location, you have the following rights:</p>
        <ul>
          <li><strong>Access:</strong> download all your data at <em>Settings → Export my data</em> or by emailing {CONTACT_EMAIL}.</li>
          <li><strong>Erasure:</strong> delete your account and all associated data at <em>Settings → Delete account</em>. Deletion is immediate and irreversible.</li>
          <li><strong>Rectification:</strong> update your profile at any time from the Edit Profile screen.</li>
          <li><strong>Portability:</strong> your data export is provided as a structured JSON file.</li>
          <li><strong>Withdraw consent:</strong> toggle analytics cookies off at any time.</li>
          <li><strong>Do Not Sell (CCPA):</strong> California residents may opt out of any sale of personal information at <em>Settings → Privacy → Do Not Sell My Data</em>. We do not currently sell personal data, but this setting is available as required by law.</li>
          <li><strong>Complaint:</strong> you may lodge a complaint with your local data protection authority.</li>
        </ul>
        <p>To exercise any right, email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--primary)]">{CONTACT_EMAIL}</a>. We respond within 30 days.</p>
      </Section>

      <Section title="7. Data retention">
        <p>We keep your data for as long as your account is active. Accounts inactive for more than 18 months will receive a 30-day deletion warning by email. If you do not log in within that period, your account and all associated data are permanently deleted.</p>
        <p>After you request account deletion, all data is erased immediately. Payment records may be retained for up to 7 years to comply with financial regulations.</p>
      </Section>

      <Section title="8. Security">
        <p>Passwords are hashed with bcrypt (cost factor 12). Connections use HTTPS/TLS. API endpoints are rate-limited. We conduct security reviews before major releases. Despite these measures, no system is 100% secure — please use a strong, unique password.</p>
      </Section>

      <Section title="9. Children">
        <p>BYN is not directed at children under 18. We do not knowingly collect data from anyone under 18. If you believe we have collected data from a minor, contact us immediately at {CONTACT_EMAIL}.</p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>We will notify you of material changes by email or in-app notice at least 14 days before they take effect. Continued use after that date constitutes acceptance.</p>
      </Section>

      <Section title="11. Contact">
        <p>Privacy enquiries: <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--primary)]">{CONTACT_EMAIL}</a><br />General support: <a href="mailto:support@buildyournetwork.online" className="text-[var(--primary)]">support@buildyournetwork.online</a></p>
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
