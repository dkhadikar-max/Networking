'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useProfileDrawer } from '@/context/ProfileDrawerContext';
import Avatar from '@/components/ui/Avatar';
import type { Connection, Message } from '@/lib/types';

type Props = { connectionId: string };

export default function ChatWindow({ connectionId }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const { openProfile } = useProfileDrawer();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiGet<{ messages: Message[] }>(`/api/messages/${connectionId}`);
      setMessages(data.messages ?? []);
    } catch { /* silent background poll */ }
  }, [connectionId]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [connData, msgData] = await Promise.all([
          apiGet<{ connections: Connection[] }>('/api/connections'),
          apiGet<{ messages: Message[] }>(`/api/messages/${connectionId}`),
        ]);
        const conn = connData.connections.find(c => c.connection.id === connectionId);
        setConnection(conn ?? null);
        setMessages(msgData.messages ?? []);
      } catch {
        toast('Failed to load conversation', 'error');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [connectionId, toast]);

  useEffect(() => {
    pollRef.current = setInterval(fetchMessages, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await apiPost('/api/messages', { connectionId, text: trimmed });
      await fetchMessages();
    } catch (err) {
      setText(trimmed);
      toast(err instanceof Error ? err.message : 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8 text-[var(--muted)]">
        <p className="text-sm">Conversation not found</p>
      </div>
    );
  }

  const other = connection.user;

  function formatTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-white shrink-0">
        <Link href="/chat" className="p-2 rounded-xl hover:bg-[var(--sur2)] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </Link>
        <button
          onClick={() => openProfile(other)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <Avatar src={other.photos?.[0]} name={other.name} size={40} online={other.is_online} />
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[var(--text)] truncate">{other.name}</p>
            {other.headline && <p className="text-xs text-[var(--sub)] truncate">{other.headline}</p>}
          </div>
        </button>
        {connection.hoursLeft != null && connection.hoursLeft <= 24 && (
          <span className="text-xs text-[var(--accent)] font-semibold shrink-0">⏱ {connection.hoursLeft}h left</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-[var(--muted)] py-8">
            <p>Start the conversation! Say hello to {other.name}.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.from === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <Avatar src={other.photos?.[0]} name={other.name} size={28} className="mr-2 mt-0.5 shrink-0 self-end" />
              )}
              <div className={`max-w-[75%] space-y-0.5`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-[var(--primary)] text-white rounded-br-sm'
                    : 'bg-white border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
                <p className={`text-[10px] text-[var(--muted)] ${isMe ? 'text-right' : 'text-left'} px-1`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex items-end gap-2 px-4 py-3 border-t border-[var(--border)] bg-white shrink-0">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent); } }}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] max-h-32 leading-relaxed"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[var(--primary-dark)] transition-colors shrink-0"
        >
          {sending ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
