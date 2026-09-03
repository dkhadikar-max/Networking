'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  IconDiscover,
  IconCircles,
  IconConnections,
  IconChat,
  IconProfile,
  IconSignOut,
} from '@/components/ui/BynIcons';

const TABS = [
  {
    href: '/discover',
    label: 'Discover',
    icon: <IconDiscover size={20} strokeWidth={2} />,
  },
  {
    href: '/circles',
    label: 'Circles',
    icon: <IconCircles size={20} strokeWidth={2} />,
  },
  {
    href: '/likes',
    label: 'Likes',
    icon: <IconConnections size={20} strokeWidth={2} />,
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: <IconChat size={20} strokeWidth={2} />,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: <IconProfile size={20} strokeWidth={2} />,
  },
];

export default function DesktopNav() {
  const path = usePathname();
  const { logout } = useAuth();

  return (
    <nav className="desk-nav">
      <Link href="/discover" className="desk-brand">
        <img src="/assets/logo.png" alt="Build Your Network" width={32} height={32} style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
        <span>Build Your Network</span>
      </Link>

      {TABS.map(tab => {
        const active = path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`desk-nav-btn${active ? ' active' : ''}`}
          >
            <span className="desk-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <div style={{ flex: 1 }} />
      <button
        onClick={logout}
        className="desk-nav-btn"
        style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}
      >
        <span className="desk-icon">
          <IconSignOut size={18} strokeWidth={2} />
        </span>
        <span>Sign Out</span>
      </button>
    </nav>
  );
}
