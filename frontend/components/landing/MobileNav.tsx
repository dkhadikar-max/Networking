'use client';

import { useState, useEffect } from 'react';

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
        <a href="#trust" onClick={() => setMenuOpen(false)}>Trust</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#how" onClick={() => setMenuOpen(false)}>How It Works</a>
        <a href="/signup" className="nav-cta">Open Web App</a>
      </div>
      <button className="mobile-menu-btn" aria-label="Menu" onClick={() => setMenuOpen(o => !o)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F2937" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </>
  );
}
