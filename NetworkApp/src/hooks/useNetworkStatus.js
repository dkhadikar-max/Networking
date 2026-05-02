/**
 * useNetworkStatus — lightweight offline detection.
 * Driven by api.js interceptors via notifyNetworkError / notifyNetworkRestored.
 */
import { useState, useEffect } from 'react';

let globalOfflineListeners = new Set();
let globalOfflineState     = false;

export function notifyNetworkError() {
  if (!globalOfflineState) {
    globalOfflineState = true;
    globalOfflineListeners.forEach(fn => fn(true));
  }
}

export function notifyNetworkRestored() {
  if (globalOfflineState) {
    globalOfflineState = false;
    globalOfflineListeners.forEach(fn => fn(false));
  }
}

export default function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(globalOfflineState);

  useEffect(() => {
    const listener = (offline) => setIsOffline(offline);
    globalOfflineListeners.add(listener);
    // Sync with current global state in case it changed before mount
    setIsOffline(globalOfflineState);
    return () => { globalOfflineListeners.delete(listener); };
  }, []);

  return { isOffline };
}
