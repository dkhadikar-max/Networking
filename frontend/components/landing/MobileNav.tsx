'use client';

import { useState, useEffect } from 'react';
import { IconMenu } from '@/components/ui/BynIcons';

export default function MobileNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [menuOpen]);

  return (
    <>
      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="/discover" onClick={() => setMenuOpen(false)}>Discover</a>
        <a href="/circles" onClick={() => setMenuOpen(false)}>Circles</a>
        <a href="#screens" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="/login" className="nav-login" onClick={() => setMenuOpen(false)}>Log in</a>
        <a href="/signup" className="nav-cta" onClick={() => setMenuOpen(false)}>Join free</a>
      </div>
      <button className="mobile-menu-btn" aria-label="Menu" onClick={() => setMenuOpen(o => !o)}>
        <IconMenu size={24} strokeWidth={2} className="text-[#1F2937]" />
      </button>
    </>
  );
}
