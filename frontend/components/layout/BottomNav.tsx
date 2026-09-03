'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconDiscover,
  IconCircles,
  IconChat,
  IconConnections,
  IconProfile,
} from '@/components/ui/BynIcons';

const TABS = [
  {
    href: '/discover',
    label: 'Discover',
    icon: (active: boolean) => <IconDiscover size={20} active={active} />,
  },
  {
    href: '/circles',
    label: 'Circles',
    icon: (active: boolean) => <IconCircles size={20} active={active} />,
  },
  {
    href: '/chat',
    label: 'Chats',
    icon: (active: boolean) => <IconChat size={20} active={active} />,
  },
  {
    href: '/likes',
    label: 'Connect',
    icon: (active: boolean) => <IconConnections size={20} active={active} />,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (active: boolean) => <IconProfile size={20} active={active} />,
  },
];

export default function BottomNav() {
  const path = usePathname();

  // Hide the tab bar inside an open conversation — matches standard chat UX
  // and frees up space for the message input above the mobile keyboard.
  if (/^\/chat\/[^/]+/.test(path)) return null;

  return (
    <nav className="bottom-nav">
      {TABS.map(tab => {
        const active = path.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`nav-item${active ? ' active' : ''}`}
          >
            {tab.icon(active)}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
