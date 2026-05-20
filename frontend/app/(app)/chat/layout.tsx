'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import ConversationList from '@/components/chat/ConversationList';
import type { Connection } from '@/lib/types';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const pathname = usePathname();
  const [connections, setConnections] = useState<Connection[]>([]);

  // Extract active conversation id from /chat/[id]
  const activeId = pathname.startsWith('/chat/') && pathname.length > 6
    ? pathname.slice(6)
    : undefined;

  useEffect(() => {
    apiGet<{ connections: Connection[] }>('/api/connections')
      .then(r => setConnections(r.connections ?? []))
      .catch(() => toast('Failed to load chats', 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 border-r border-[var(--border)] shrink-0">
        <div className="px-4 py-4 border-b border-[var(--border)] shrink-0">
          <h1 className="text-lg font-bold text-[var(--text)]">Messages</h1>
        </div>
        <ConversationList connections={connections} activeId={activeId} />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
