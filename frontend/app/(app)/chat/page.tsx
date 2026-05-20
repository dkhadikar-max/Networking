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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="px-4 py-4 border-b border-[var(--border)] shrink-0">
        <h1 className="text-xl font-bold text-[var(--text)]">Messages</h1>
        {!loading && (
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {connections.length} active {connections.length === 1 ? 'conversation' : 'conversations'}
          </p>
        )}
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
        </div>
      ) : (
        <ConversationList connections={connections} />
      )}
    </div>
  );
}
