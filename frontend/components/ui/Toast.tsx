'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastItem = { id: number; message: string; type: 'success' | 'error' | 'info' };
type ToastCtx = { toast: (msg: string, type?: ToastItem['type']) => void };

const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now();
    setItems(prev => [...prev, { id, message, type }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none px-4 w-full">
        {items.map(t => (
          <div
            key={t.id}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg text-white toast-enter text-center"
            style={{
              background: t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--danger)' : 'var(--text)',
              border: `1.5px solid ${t.type === 'success' ? 'rgba(255,255,255,0.55)' : t.type === 'error' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'}`,
              maxWidth: 'min(420px, 100%)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
