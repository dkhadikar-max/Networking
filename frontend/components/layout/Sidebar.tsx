'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import clsx from 'clsx';
import {
  IconDiscover,
  IconConnections,
  IconChat,
  IconProfile,
  IconSignOut,
} from '@/components/ui/BynIcons';

const BYN_LOGO = (
  <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
    <circle cx="25" cy="25" r="10" fill="#1DB7A6" />
    <circle cx="75" cy="50" r="16" fill="#1DB7A6" />
    <circle cx="25" cy="75" r="10" fill="#F4A259" />
    <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round" />
    <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round" />
    <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

const TABS = [
  {
    href: '/discover',
    label: 'Discover',
    icon: <IconDiscover size={20} strokeWidth={2} />,
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

export default function Sidebar() {
  const path = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="flex flex-col w-56 shrink-0 h-full border-r border-[var(--border)] bg-white/97 backdrop-blur overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5 border-b border-[var(--border)]">
        {BYN_LOGO}
        <span className="font-bold text-[var(--text)] tracking-tight text-[15px]">Build Your Network</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {TABS.map(tab => {
          const active = path.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-colors',
                active
                  ? 'bg-[var(--light)] text-[var(--primary)]'
                  : 'text-[var(--sub)] hover:bg-[var(--sur2)] hover:text-[var(--text)]'
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-[var(--muted)] hover:bg-[var(--sur2)] hover:text-[var(--danger)] transition-colors"
        >
          <IconSignOut size={18} strokeWidth={2} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
