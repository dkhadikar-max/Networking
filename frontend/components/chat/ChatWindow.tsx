'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useProfileDrawer } from '@/context/ProfileDrawerContext';
import Avatar from '@/components/ui/Avatar';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import { formatIntent } from '@/lib/intent';
import type { Connection, Message } from '@/lib/types';

type Props = {
  connectionId: string;
  onBack?: () => void;
  isSplitView?: boolean;
};

// -- 1-Click Builder Icebreaker Suggestions ----------------------------------
const ICEBREAKER_TEMPLATES = [
  {
    label: '📅 15-min Intro Call',
    text: 'Hey! Would you be open to a quick 15-minute intro call sometime this week?',
  },
  {
    label: '🚀 Tech Stack Details',
    text: 'I would love to learn more about the tech stack and architecture you are building with.',
  },
  {
    label: '🤝 Co-Founder Fit',
    text: 'I saw our skills and intents are aligned. Would love to explore collaboration possibilities!',
  },
  {
    label: '📁 Prototype & Pitch',
    text: 'Do you have a prototype link, GitHub repo, or deck you can share?',
  },
];

// Helper to auto-link URLs in message text
function renderMessageText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold hover:opacity-80 transition-opacity break-all"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatWindow({ connectionId, onBack, isSplitView }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const { openProfile } = useProfileDrawer();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPriority, setShowPriority] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiGet<Message[]>(`/api/messages/${connectionId}`);
      setMessages(Array.isArray(data) ? data : []);
    } catch { /* silent background poll */ }
  }, [connectionId]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [conn, msgs] = await Promise.all([
          apiGet<Connection>(`/api/connections/${connectionId}`),
          apiGet<Message[]>(`/api/messages/${connectionId}`),
        ]);
        setConnection(conn ?? null);
        setMessages(Array.isArray(msgs) ? msgs : []);
      } catch {
        toast('Failed to load conversation', 'error');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [connectionId, toast]);

  useEffect(() => {
    let cancelled = false;
    let errors = 0;
    pollRef.current = null;

    async function tick() {
      if (cancelled) return;
      if (!document.hidden) {
        try { await fetchMessages(); errors = 0; }
        catch { errors = Math.min(errors + 1, 5); }
      }
      if (!cancelled) {
        const delay = document.hidden ? 30_000 : Math.min(4000 * 2 ** errors, 32_000);
        pollRef.current = setTimeout(tick, delay) as unknown as ReturnType<typeof setInterval>;
      }
    }

    function onVisible() {
      if (!document.hidden && pollRef.current) {
        clearTimeout(pollRef.current as unknown as ReturnType<typeof setTimeout>);
        pollRef.current = setTimeout(tick, 0) as unknown as ReturnType<typeof setInterval>;
      }
    }

    pollRef.current = setTimeout(tick, 4000) as unknown as ReturnType<typeof setInterval>;
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current as unknown as ReturnType<typeof setTimeout>);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    const optimisticId = `opt-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optimisticId,
      from: user!.id,
      text: trimmed,
      created_at: new Date().toISOString(),
      connection_id: connectionId,
    }]);
    try {
      await apiPost(`/api/messages/${connectionId}`, { text: trimmed });
      await fetchMessages();
    } catch (err) {
      setText(trimmed);
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      toast(err instanceof Error ? err.message : 'Failed to send', 'error');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function applyIcebreaker(templateText: string) {
    setText(templateText);
    textareaRef.current?.focus();
  }

  // Calculate grouped message sequence
  const groupedMessages = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    return list.map((msg, i) => {
      const isMe = msg.from === user?.id;
      const prev = list[i - 1];
      const next = list[i + 1];

      const sameSenderAsPrev = prev && prev.from === msg.from && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 120000);
      const sameSenderAsNext = next && next.from === msg.from && (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < 120000);

      return {
        ...msg,
        isMe,
        isFirstInGroup: !sameSenderAsPrev,
        isLastInGroup: !sameSenderAsNext,
      };
    });
  }, [messages, user?.id]);

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50">
        <div className="w-9 h-9 rounded-full border-3 border-[#157A6E] border-t-transparent animate-spin mb-2" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-400">Loading conversation…</span>
      </div>
    );
  }

  if (!connection || !connection.user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 text-slate-400">
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-xl mb-2 shadow-xs">
          🔒
        </div>
        <h3 className="font-bold text-sm text-slate-700 mb-1">Conversation Not Found</h3>
        <p className="text-xs max-w-xs">This connection may have expired or been removed.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            ← Back to chats
          </button>
        )}
      </div>
    );
  }

  const other = connection.user;

  return (
    // min-w-0: as a flex row child (of the page wrapper below, and of the
    // desktop split view), a bare `flex-1` still refuses to shrink below
    // its own content's natural min-width — measured at 390px acceptance,
    // this alone was enough to push the whole window ~50px past the
    // viewport, invisibly clipped by the page's `overflow:hidden` (see the
    // 2026-08-30 fixture acceptance pass).
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white border-l border-slate-200/80">
      {/* -- TOP HEADER ------------------------------------------------------ */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 bg-white/95 backdrop-blur-md flex items-center justify-between gap-2 z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Back button on Mobile / non-split */}
          {!isSplitView && (
            onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 active:scale-90 transition-all cursor-pointer rounded-full mr-0.5 shrink-0"
                aria-label="Back to conversations"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </button>
            ) : (
              <Link
                href="/chat"
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 active:scale-90 transition-all cursor-pointer rounded-full mr-0.5 shrink-0"
                aria-label="Back to conversations"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </Link>
            )
          )}

          <button
            type="button"
            onClick={() => openProfile(other)}
            className="flex items-center gap-2.5 sm:gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer group min-w-0 flex-1"
          >
            <div className="relative shrink-0">
              <Avatar src={other.photos?.[0]} name={other.name} size={42} />
              {other.is_online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" title="Online"></span>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-[15px] font-bold text-slate-900 leading-tight flex items-center gap-1 group-hover:text-[#157A6E] transition-colors min-w-0">
                <span className="truncate">{other.name}</span>
                {other.verified && (
                  <span title="Verified identity" className="inline-flex items-center text-[#157A6E] shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </span>
                )}
              </h1>
              <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 truncate min-w-0">
                <span className="shrink-0">🎯</span>
                <span className="truncate">Looking for: {other.intent ? formatIntent(other.intent) : 'Co-founder'}</span>
              </span>
            </div>
          </button>
        </div>

        {/* Right Actions: Expiry & Priority Badge & Options */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end justify-center shrink-0">
            <button
              type="button"
              onClick={() => setShowPriority(true)}
              className="text-[10px] font-bold text-[#E65100] bg-[#FFF0EB] border border-[#FFCCBC] px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs hover:bg-[#FFE0D6] cursor-pointer"
              title="Priority connection"
              aria-label="Priority connection"
            >
              ⚡ Priority
            </button>
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
              18h left
            </span>
          </div>
          <button type="button" aria-label="More options" className="p-1 text-slate-400 hover:text-slate-600 active:scale-90 transition-all cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/></svg>
          </button>
        </div>
      </div>

      <PriorityMessageModal
        open={showPriority}
        onClose={() => setShowPriority(false)}
        mode="compose"
        targetId={other.id}
        targetName={other.name}
      />

      {/* -- MESSAGE CANVAS (LinkedIn-style clean white canvas & inner column) -- */}
      <div className="flex-1 overflow-y-auto bg-white text-left no-scrollbar">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-5 py-3">

          <div className="text-center mb-4">
             <span className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">
                Match Established {other.intent ? `· ${formatIntent(other.intent)}` : '· Today'}
             </span>
          </div>

          {/* Empty State / 1-Click Icebreaker Chips */}
          {messages.length === 0 && (
            <div className="max-w-lg mx-auto py-6 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-3">
                💡 1-Click Builder Icebreakers
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Prefer server-generated personalized icebreakers (deterministic
                    per profile pair, /api/connections/:connId) — fall back to
                    generic templates when the endpoint returns no chips (older
                    server, unauthenticated fetch cached, etc.). */}
                {((connection?.icebreakers && connection.icebreakers.length > 0)
                  ? connection.icebreakers
                  : ICEBREAKER_TEMPLATES).map(tmpl => (
                  <button
                    key={tmpl.label}
                    type="button"
                    onClick={() => applyIcebreaker(tmpl.text)}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left hover:border-[#157A6E] hover:bg-teal-50/30 active:scale-98 transition-all cursor-pointer group"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-[#157A6E] block mb-0.5">
                      {tmpl.label}
                    </span>
                    <span className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      &quot;{tmpl.text}&quot;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Stream */}
          <div className="space-y-1.5">
            {groupedMessages.map((msg) => {
              const { id, text: msgText, created_at, isMe, isLastInGroup } = msg;

              return (
                <div
                  key={id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Other party avatar beside last message of group */}
                  {!isMe && (
                    <div className="w-7 shrink-0 mr-1.5">
                      {isLastInGroup ? (
                        <Avatar
                          src={other.photos?.[0]}
                          name={other.name}
                          size={26}
                          className="mt-auto"
                        />
                      ) : <div className="w-7 h-7" />}
                    </div>
                  )}

                  {/* Message Bubble Column */}
                  <div className="flex flex-col min-w-0 max-w-[72%] sm:max-w-[68%]">
                    <div
                      className={`px-3.5 py-2 text-[13px] leading-[1.45] rounded-xl ${
                        isMe
                          ? 'bg-[#157A6E] text-white'
                          : 'bg-[#F3F4F6] text-slate-900'
                      }`}
                    >
                      <p className="m-0 break-words whitespace-pre-wrap">{renderMessageText(msgText)}</p>
                    </div>

                    {/* Metadata Row */}
                    <div className={`flex items-center gap-1 mt-0.5 px-1 text-[9px] ${
                      isMe ? 'text-slate-400 justify-end' : 'text-slate-400 justify-start'
                    }`}>
                      <span>{formatTime(created_at)}</span>
                      {isMe && (
                        <span className="font-bold" title="Delivered">
                          ✓✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* -- 1-CLICK QUICK PROMPT TRAY (If conversation is ongoing) ----------- */}
      {messages.length > 0 && (
        <div className="px-4 sm:px-5 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {ICEBREAKER_TEMPLATES.slice(0, 3).map(tmpl => {
            const iconMatch = tmpl.label.match(/^(\p{Emoji}|\p{Extended_Pictographic})/u);
            const icon = iconMatch ? iconMatch[0] : '';
            const text = tmpl.label.replace(/^(\p{Emoji}|\p{Extended_Pictographic})\s*/u, '');
            return (
              <button
                key={tmpl.label}
                type="button"
                onClick={() => applyIcebreaker(tmpl.text)}
                className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                {icon && <span>{icon}</span>}
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* -- MESSAGE COMPOSER ------------------------------------------------ */}
      <form
        onSubmit={sendMessage}
        className="px-4 sm:px-5 py-3 bg-white flex items-end gap-2 shrink-0 border-t border-slate-100"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <button type="button" aria-label="Attach file" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer hover:bg-slate-200 transition-colors">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14"/></svg>
        </button>

        <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 flex flex-col px-3 py-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value.slice(0, 2000))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message..."
            className="flex-1 bg-transparent text-[13px] resize-none focus:outline-none py-1 min-h-[32px] max-h-28 text-slate-900 placeholder:text-slate-400 leading-normal"
          />
          {text.length > 1800 && (
            <span className="absolute -top-5 right-2 text-[10px] font-bold text-amber-600 bg-white/80 px-1 rounded">
              {text.length}/2000
            </span>
          )}
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="w-8 h-8 rounded-lg bg-[#157A6E] text-white flex items-center justify-center shrink-0 mb-0.5 disabled:opacity-40 hover:bg-[#0D6E63] active:scale-95 transition-all cursor-pointer"
          aria-label="Send message"
          title="Send message"
        >
          {sending ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          )}
        </button>
      </form>
    </div>
  );
}
