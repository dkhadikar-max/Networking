'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import ConversationList from '@/components/chat/ConversationList';
import type { Connection } from '@/lib/types';

export default function ChatListPage() {
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ connections: Connection[] }>('/api/connections')
      .then(r => setConnections(r.connections ?? []))
      .catch(() => toast('Failed to load chats', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Mobile: full list */}
      <div className="lg:hidden flex flex-col flex-1 min-h-0">
        <div className="px-4 py-4 border-b border-[var(--border)] shrink-0">
          <h1 className="text-xl font-bold text-[var(--text)]">Messages</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">{connections.length} active {connections.length === 1 ? 'conversation' : 'conversations'}</p>
        </div>
        <ConversationList connections={connections} />
      </div>

      {/* Desktop: empty state (conversations shown in layout sidebar) */}
      <div className="hidden lg:flex flex-1 items-center justify-center text-center p-8 text-[var(--muted)]">
        <div>
          <div className="w-16 h-16 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--sub)]">Select a conversation</p>
        </div>
      </div>
    </>
  );
}
