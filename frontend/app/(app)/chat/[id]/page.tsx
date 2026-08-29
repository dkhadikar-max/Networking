'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import ChatWindow from '@/components/chat/ChatWindow';
import ConversationList from '@/components/chat/ConversationList';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import type { Connection } from '@/lib/types';

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showPriority, setShowPriority] = useState(false);

  useEffect(() => {
    apiGet<Connection[]>('/api/connections')
      .then(r => setConnections(r ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--bg)]">
      {/* Desktop Left Sidebar */}
      <div className="hidden lg:flex flex-col min-h-0 w-[360px] xl:w-[380px] shrink-0 border-r border-slate-200/90 bg-white">
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white/95 shrink-0">
          <div>
            <h1 className="font-extrabold text-xl text-slate-900 tracking-tight">Messages</h1>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              {connections.length} {connections.length === 1 ? 'active builder' : 'active builders'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPriority(true)}
            className="p-2 rounded-xl text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-colors cursor-pointer"
            title="Priority messages"
            aria-label="Priority messages"
          >
            ⚡
          </button>
        </div>

        <PriorityMessageModal open={showPriority} onClose={() => setShowPriority(false)} mode="inbox" />

        <ConversationList
          connections={connections}
          activeId={id}
          onSelect={(selectedId) => router.push(`/chat/${selectedId}`)}
        />
      </div>

      {/* Main Chat Window (Full width on mobile, right panel on desktop) */}
      <div className="flex-1 flex min-h-0">
        <ChatWindow
          connectionId={id}
          isSplitView={false}
          onBack={() => router.push('/chat')}
        />
      </div>
    </div>
  );
}
