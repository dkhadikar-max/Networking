'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LandingClient() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.email_verified && user.onboarding_stage === 'complete') {
      router.replace('/discover');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.animate').forEach(el => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateY(24px)';
      const delay = h.classList.contains('delay-4') ? '400ms'
                  : h.classList.contains('delay-3') ? '300ms'
                  : h.classList.contains('delay-2') ? '200ms'
                  : h.classList.contains('delay-1') ? '100ms' : '0ms';
      h.style.transition = `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay},transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}`;
      obs.observe(el);
    });
    const onScroll = () => {
      const nav = document.querySelector('nav') as HTMLElement | null;
      if (nav) nav.style.boxShadow = window.scrollY > 50 ? '0 1px 20px rgba(0,0,0,0.05)' : 'none';
    };
    const onHashClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const t = document.querySelector(a.getAttribute('href') ?? '');
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onHashClick);
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onHashClick);
    };
  }, []);

  return null;
}
