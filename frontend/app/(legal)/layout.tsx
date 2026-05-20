import Link from 'next/link';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-[var(--primary)] text-lg">BuildYourNetwork</Link>
          <Link href="/login" className="text-sm text-[var(--sub)] hover:text-[var(--primary)] transition-colors">Sign in</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-[var(--border)] mt-16 py-8 text-center text-sm text-[var(--muted)]">
        <p>
          &copy; {new Date().getFullYear()} Build Your Network &middot;{' '}
          <Link href="/privacy" className="text-[var(--primary)] hover:underline">Privacy</Link> &middot;{' '}
          <Link href="/terms" className="text-[var(--primary)] hover:underline">Terms</Link> &middot;{' '}
          <a href="mailto:support@buildyournetwork.online" className="text-[var(--primary)] hover:underline">Contact</a>
        </p>
      </footer>
    </div>
  );
}
