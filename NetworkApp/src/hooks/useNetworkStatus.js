/**
 * useNetworkStatus — lightweight offline detection without netinfo package.
 * Detects connectivity by catching "Network Error" from axios calls,
 * and exposes an { isOffline, setOffline } interface.
 *
 * Usage:
 *   const { isOffline } = useNetworkStatus();
 *   if (isOffline) return <OfflineBanner />;
 */
import { useState, useCallback, useRef } from 'react';

let globalOfflineListeners = new Set();
let globalOfflineState = false;

/** Call this from api.js interceptors when a network error is detected */
export function notifyNetworkError() {
  if (!globalOfflineState) {
    globalOfflineState = true;
    globalOfflineListeners.forEach(fn => fn(true));
  }
}

/** Call this when an API call succeeds (we're back online) */
export function notifyNetworkRestored() {
  if (globalOfflineState) {
    globalOfflineState = false;
    globalOfflineListeners.forEach(fn => fn(false));
  }
}

export default function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(globalOfflineState);
  const listenerRef = useRef(null);

  // Register/unregister listener
  const mountRef = useCallback((node) => {
    if (node === null) {
      // unmounting
      if (listenerRef.current) {
        globalOfflineListeners.delete(listenerRef.current);
      }
    } else {
      const listener = (offline) => setIsOffline(offline);
      listenerRef.current = listener;
      globalOfflineListeners.add(listener);
    }
  }, []);

  // Allow manual override from any component
  const setOffline = useCallback((val) => {
    if (val) notifyNetworkError();
    else notifyNetworkRestored();
  }, []);

  return { isOffline, setOffline, mountRef };
}
