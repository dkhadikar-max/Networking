import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Build Your Network',
  description: 'Terms and conditions for using Build Your Network.',
};

const LAST_UPDATED = 'May 21, 2026';
const CONTACT_EMAIL = 'support@buildyournetwork.online';

export default function TermsPage() {
  return (
    <article className="prose prose-sm max-w-none text-[var(--text)]">
      <h1 className="text-3xl font-bold text-[var(--text)] mb-2">Terms of Service</h1>
      <p className="text-[var(--muted)] text-sm mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="1. Acceptance">
        <p>By creating an account on Build Your Network ({'"'}BYN{'"'}, {'"'}Service{'"'}), you confirm that you are at least 18 years old and agree to these Terms. If you are accessing BYN on behalf of an organisation, you represent that you have authority to bind that organisation.</p>
      </Section>

      <Section title="2. Eligibility">
        <p>You must be at least 18 years of age to use BYN. By creating an account, you self-declare that you meet this minimum age requirement. We reserve the right to terminate accounts that we reasonably believe belong to users under this minimum age.</p>
      </Section>

      <Section title="3. Your account">
        <p>You are responsible for maintaining the security of your account credentials. You must not share your password or allow others to access your account. You are responsible for all activity that occurs under your account. Notify us immediately at {CONTACT_EMAIL} if you suspect unauthorised access.</p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Post content that is false, misleading, defamatory, harassing, threatening, or that violates any law.</li>
          <li>Impersonate any person or entity.</li>
          <li>Post or transmit spam, unsolicited commercial messages, or pyramid schemes.</li>
          <li>Post content involving child sexual abuse material (CSAM), terrorism, incitement to violence, or other illegal content.</li>
          <li>Scrape, crawl, or harvest user data without our express written permission.</li>
          <li>Attempt to bypass rate limits, authentication, or other security controls.</li>
          <li>Use the platform to recruit users to competing services at scale.</li>
        </ul>
        <p>Violations may result in immediate account suspension or termination without notice.</p>
      </Section>

      <Section title="5. User content">
        <p>You retain ownership of content you post on BYN (bio, photos, messages, etc.). By posting, you grant BYN a non-exclusive, worldwide, royalty-free licence to display and distribute your content solely to provide the Service. You represent that you have the rights to grant this licence and that your content does not infringe third-party rights.</p>
        <p>We do not endorse any user-generated content and are not responsible for content posted by users.</p>
      </Section>

      <Section title="6. Content moderation and DSA">
        <p>BYN provides a mechanism to report illegal content and harmful behaviour. Reports can be submitted via the Report function on any profile or message. We review reports and take action within a reasonable timeframe. Decisions on content removal or account suspension can be appealed by emailing {CONTACT_EMAIL} with the subject line {'"'}Content Appeal{'"'}.</p>
        <p>For illegal content (CSAM, terrorism, etc.), we use an expedited review process and may suspend accounts pending review. We cooperate with law enforcement requests as required by applicable law.</p>
      </Section>

      <Section title="7. Premium subscriptions">
        <p>Premium plans are billed in advance on a monthly or quarterly basis. Payments are processed by Razorpay. Prices are listed on the upgrade page and may change with 30 days&apos; notice. Subscriptions automatically expire at the end of the billing period — there is no auto-renewal without your action. We do not offer refunds for partial billing periods except where required by law.</p>
      </Section>

      <Section title="8. Intellectual property">
        <p>The BYN name, logo, design, and underlying software are owned by Build Your Network and protected by intellectual property laws. You may not copy, modify, or distribute them without our written permission.</p>
      </Section>

      <Section title="9. Disclaimer of warranties">
        <p>The Service is provided {'"'}as is{'"'} without warranty of any kind. We do not guarantee that BYN will be available continuously, error-free, or secure. To the maximum extent permitted by law, BYN disclaims all warranties, express or implied.</p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>To the maximum extent permitted by applicable law, BYN&apos;s total liability to you for any claim arising from your use of the Service is limited to the amount you paid us in the 12 months preceding the claim, or ₹1,000 (whichever is greater). We are not liable for indirect, incidental, or consequential damages.</p>
      </Section>

      <Section title="11. Governing law">
        <p>These Terms are governed by the laws of India. Disputes shall first be attempted to be resolved by good-faith negotiation. If unresolved, disputes shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra, India.</p>
      </Section>

      <Section title="12. Termination">
        <p>You may delete your account at any time from <em>Settings → Delete account</em>. We may suspend or terminate your account for violations of these Terms. Upon termination, your licence to use the Service ends and your data is deleted per our Privacy Policy.</p>
      </Section>

      <Section title="13. Changes to these terms">
        <p>We will notify you of material changes by email or in-app notice at least 14 days before they take effect. Continued use of BYN after that date constitutes acceptance of the updated Terms.</p>
      </Section>

      <Section title="14. Contact">
        <p>For questions about these Terms: <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--primary)]">{CONTACT_EMAIL}</a></p>
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
