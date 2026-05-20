'use client';

import { use } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChatWindow connectionId={id} />;
}
