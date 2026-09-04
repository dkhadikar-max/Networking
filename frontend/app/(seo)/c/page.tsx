import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_URL, APP_NAME } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, circleItemListSchema } from '@/lib/seo/schema';

// Public Circles discovery index — Phase 3. Lists ONLY posts that passed
// the Phase 1 indexed_at gate (via the backend's own live re-verification,
// not a blind trust of that column — see server.js GET /api/circles/
// public-index). This is the crawl path INTO every /c/[id] page: without
// an index like this, individual post pages are only reachable via the
// sitemap, which crawlers treat as a weaker discovery signal than real
// internal links.

interface PublicCirclePost {
  id: string;
  excerpt: string;
  tags: string[];
  group_name: string;
  author_first_name: string | null;
  created_at: string;
}

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';
export const revalidate = 300; // matches the backend's own Cache-Control: max-age=300

async function fetchIndex(): Promise<PublicCirclePost[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/circles/public-index?limit=200`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: 'Public Circles — Real Conversations from Builders',
    description: `Browse public posts from ${APP_NAME}'s Circles — builders sharing what they're working on, hiring for, and looking to collaborate on. Join to reply and connect.`,
    canonical: '/c',
    keywords: ['circles', 'builder community', 'startup community', 'founder conversations'],
  });
}

export default async function CirclesIndexPage() {
  const posts = await fetchIndex();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(
        webPageSchema('Public Circles', `${APP_URL}/c`, `Public posts from ${APP_NAME}'s Circles.`, [{ name: 'Circles', url: `${APP_URL}/c` }])
      ) }} />
      {posts.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(
          circleItemListSchema(posts.map(p => ({ url: `${APP_URL}/c/${p.id}`, excerpt: p.excerpt })))
        ) }} />
      )}

      <div style={{ minHeight: '100vh', background: '#FFF4EC', fontFamily: "'Inter', -apple-system, sans-serif", color: '#1F2937' }}>
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(255,244,236,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(253,232,215,0.6)',
        }}>
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: '#0F766E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo.png" alt={APP_NAME} width={26} height={26} style={{ borderRadius: 6 }} />
              {APP_NAME}
            </Link>
            <Link href="/signup" style={{ background: '#0F766E', color: '#fff', padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              Join Free
            </Link>
          </div>
        </nav>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '100px 24px 80px' }}>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none' }}>Home</Link> › Circles
          </p>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, letterSpacing: -0.5, marginBottom: 10 }}>
            Public Circles
          </h1>
          <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.6, marginBottom: 40, maxWidth: 520 }}>
            Real posts from builders on {APP_NAME} — what they&apos;re building, hiring for, and looking to collaborate on. Join free to reply and connect.
          </p>

          {posts.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
              No public posts yet — check back soon.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map(post => (
                <Link
                  key={post.id}
                  href={`/c/${post.id}`}
                  style={{
                    display: 'block', background: '#fff', borderRadius: 14,
                    padding: '18px 20px', textDecoration: 'none', color: 'inherit',
                    border: '1px solid rgba(226,232,240,.8)',
                  }}
                >
                  {post.tags.length > 0 && (
                    <span style={{
                      display: 'inline-block', background: '#CCFBF1', color: '#0F766E',
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
                      marginBottom: 8, letterSpacing: '0.02em', textTransform: 'uppercase',
                    }}>
                      {post.tags[0]}
                    </span>
                  )}
                  <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 8, color: '#1F2937' }}>
                    {post.excerpt}
                  </p>
                  <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>
                    {post.author_first_name ? `${post.author_first_name} in ` : 'In '}
                    <strong style={{ color: '#6B7280' }}>{post.group_name}</strong>
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <footer style={{ borderTop: '1px solid #FDE8D7', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>
            © {new Date().getFullYear()} buildyournetwork.online ·{' '}
            <Link href="/privacy" style={{ color: '#0F766E', textDecoration: 'none' }}>Privacy</Link>
            {' · '}
            <Link href="/terms" style={{ color: '#0F766E', textDecoration: 'none' }}>Terms</Link>
          </p>
        </footer>
      </div>
    </>
  );
}
