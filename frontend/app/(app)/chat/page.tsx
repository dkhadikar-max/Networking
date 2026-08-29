'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import type { Connection } from '@/lib/types';

export default function ChatListPage() {
  const toast = useToast();
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPriority, setShowPriority] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll(initial = false) {
      if (cancelled) return;
      let delay = 10_000;
      try {
        const r = await apiGet<Connection[]>('/api/connections');
        if (!cancelled) {
          const list = r ?? [];
          setConnections(list);
          errors = 0;
          // On desktop, auto-select first conversation if none selected
          if (initial && list.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
            setSelectedId(list[0].connection.id);
          }
        }
        delay = document.hidden ? 30_000 : 10_000;
      } catch {
        if (initial && !cancelled) toast('Failed to load chats', 'error');
        errors = Math.min(errors + 1, 5);
        delay = Math.min(10_000 * 2 ** errors, 60_000);
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(() => poll(), delay);
    }

    poll(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectConversation(id: string) {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      router.push(`/chat/${id}`);
    } else {
      setSelectedId(id);
    }
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--bg)]">
      {/* -- LEFT CONVERSATION SIDEBAR (Full width on mobile, 360px on desktop) -- */}
      <div className={`flex flex-col min-h-0 border-r border-slate-200/90 bg-white ${
        selectedId ? 'hidden lg:flex lg:w-[360px] xl:w-[380px] shrink-0' : 'flex-1 lg:w-[360px] xl:w-[380px] lg:flex-none'
      }`}>
        {/* Sidebar Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white/95 shrink-0">
          <div>
            <h1 className="font-extrabold text-xl text-slate-900 tracking-tight">Messages</h1>
            {!loading && (
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                {connections.length} {connections.length === 1 ? 'active builder' : 'active builders'}
              </p>
            )}
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

        {/* Conversation List Rows */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-8 h-8 rounded-full border-2 border-[#157A6E] border-t-transparent animate-spin mb-2" />
            <span className="text-xs text-slate-400 font-medium">Loading inbox…</span>
          </div>
        ) : (
          <ConversationList
            connections={connections}
            activeId={selectedId ?? undefined}
            onSelect={handleSelectConversation}
          />
        )}
      </div>

      {/* -- RIGHT ACTIVE CHAT PANE (Desktop split view & selected mobile state) -- */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {selectedId ? (
          <ChatWindow
            key={selectedId}
            connectionId={selectedId}
            isSplitView
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-3xl mb-3">
              💬
            </div>
            <h3 className="font-extrabold text-base text-slate-800 mb-1">Select a Conversation</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Choose a builder from the inbox on the left to start collaborating.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
