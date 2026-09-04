import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_URL, APP_NAME } from '@/lib/seo/data';
import { buildMetadata } from '@/lib/seo/metadata';
import { webPageSchema, discussionPostSchema } from '@/lib/seo/schema';

// Public Circles teaser page — Phase 2 of the locked exposure policy (see
// migrations/018_circles_public_indexing.sql). Renders ONLY the sanitized
// excerpt the backend returns; the full post, replies, and any counts never
// reach this page at all — there's nothing here to accidentally leak.
//
// 410 (revoked posts) never reaches this component: frontend/proxy.ts
// intercepts /c/:id before rendering and short-circuits those directly,
// since Next's notFound() can only ever produce a 404 (see node_modules/
// next/dist/docs/01-app/03-api-reference/04-functions/not-found.md). The
// fallback to notFound() below on any non-ok response is defensive only.

interface Props { params: Promise<{ id: string }> }

interface PublicPost {
  id: string;
  excerpt: string;
  tags: string[];
  group_name: string;
  author_first_name: string | null;
  created_at: string;
}

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://adequate-dedication-production-69aa.up.railway.app';

async function fetchPublicPost(id: string): Promise<PublicPost | null> {
  const res = await fetch(`${BACKEND_URL}/api/circles/public/${encodeURIComponent(id)}`, {
    next: { revalidate: 300 }, // matches the backend's own Cache-Control: max-age=300
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPublicPost(id);
  if (!post) return {};
  const title = post.excerpt.length > 65 ? post.excerpt.slice(0, 62) + '…' : post.excerpt;
  return buildMetadata({
    title,
    description: `Posted in ${post.group_name} on ${APP_NAME}. ${post.excerpt}`,
    canonical: `/c/${id}`,
    keywords: post.tags,
  });
}

export default async function CirclePostPage({ params }: Props) {
  const { id } = await params;
  const post = await fetchPublicPost(id);
  if (!post) notFound();

  const url = `${APP_URL}/c/${id}`;
  const dateLabel = new Date(post.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const authorLabel = post.author_first_name || 'a member';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(
        webPageSchema(post.excerpt, url, `A post from ${post.group_name} on ${APP_NAME}.`, [
          { name: 'Circles', url: `${APP_URL}/c` },
          { name: post.group_name, url },
        ])
      ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(discussionPostSchema({
        excerpt: post.excerpt, url, groupName: post.group_name, tags: post.tags,
        createdAt: post.created_at, authorFirstName: post.author_first_name,
      })) }} />

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
            <a href="/signup" style={{ background: '#0F766E', color: '#fff', padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              Join Free
            </a>
          </div>
        </nav>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '100px 24px 80px' }}>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24 }}>
            <Link href="/" style={{ color: '#0F766E', textDecoration: 'none' }}>Home</Link> ›{' '}
            <Link href="/c" style={{ color: '#0F766E', textDecoration: 'none' }}>Circles</Link> › {post.group_name}
          </p>

          {post.tags.length > 0 && (
            <span style={{
              display: 'inline-block', background: '#CCFBF1', color: '#0F766E',
              fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 100,
              marginBottom: 16, letterSpacing: '0.02em', textTransform: 'uppercase',
            }}>
              {post.tags[0]}
            </span>
          )}

          <h1 style={{
            background: '#fff', borderLeft: '4px solid #0F766E', borderRadius: '0 12px 12px 0',
            padding: '24px 28px', marginBottom: 20,
            fontSize: 'clamp(18px, 2.6vw, 22px)', fontWeight: 600, lineHeight: 1.65, color: '#1F2937',
          }}>
            {post.excerpt}
          </h1>

          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 48 }}>
            Posted by {authorLabel} in <strong>{post.group_name}</strong> · {dateLabel}
          </p>

          <section style={{ background: '#0F766E', borderRadius: 20, padding: '40px 32px', textAlign: 'center', color: '#fff' }}>
            <h2 style={{ fontSize: 'clamp(20px,3vw,26px)', fontWeight: 800, marginBottom: 10 }}>
              Continue the conversation
            </h2>
            <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
              This is a preview. Reply and see the full discussion inside {APP_NAME} — free to join.
            </p>
            <a href={`/circles?post=${encodeURIComponent(id)}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px', background: '#fff', color: '#0F766E',
              textDecoration: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
            }}>
              Open in {APP_NAME} →
            </a>
          </section>
        </div>

        <footer style={{ borderTop: '1px solid #FDE8D7', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>
            © {new Date().getFullYear()} buildyournetwork.online ·{' '}
            <a href="/privacy" style={{ color: '#0F766E', textDecoration: 'none' }}>Privacy</a>
            {' · '}
            <a href="/terms" style={{ color: '#0F766E', textDecoration: 'none' }}>Terms</a>
          </p>
        </footer>
      </div>
    </>
  );
}
