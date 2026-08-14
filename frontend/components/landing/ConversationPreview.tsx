// Static reuse of the real chat-bubble markup/classes from ChatWindow.tsx
// (same Tailwind utility + CSS-variable classes: bg-[var(--primary)] for
// sent, bg-[var(--sur2)] for received). Not the live ChatWindow component
// itself — that fetches a real conversation over the network on mount,
// which would fire authenticated API calls for anonymous marketing-page
// visitors. This is presentational only.
import { SAMPLE_CONVERSATION } from './samples';

export default function ConversationPreview() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(255,255,255,0.9)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {SAMPLE_CONVERSATION.map((m, i) => (
        <div key={i} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.fromMe
                ? 'bg-[var(--primary)] text-white rounded-br-sm'
                : 'bg-[var(--sur2)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
            }`}
          >
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}
