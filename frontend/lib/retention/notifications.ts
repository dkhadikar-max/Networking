import { Recommendation } from './recommendations';

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  return Notification.requestPermission();
}

export function sendBrowserNotification(rec: Recommendation) {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return;
  const n = new Notification(`${rec.icon} ${rec.title}`, {
    body: rec.description,
    icon: '/favicon.ico',
    tag: rec.id,
  });
  if (rec.href) n.onclick = () => { window.open(rec.href, '_blank'); n.close(); };
}

export function scheduleRetentionCheck(recs: Recommendation[], delayMs = 24 * 60 * 60 * 1000) {
  if (typeof window === 'undefined') return;
  const key = 'byn_retention_scheduled';
  const last = parseInt(localStorage.getItem(key) ?? '0', 10);
  if (Date.now() - last < delayMs) return;
  localStorage.setItem(key, String(Date.now()));
  const top = recs.find(r => r.priority === 'high') ?? recs[0];
  if (top) setTimeout(() => sendBrowserNotification(top), 5000);
}
