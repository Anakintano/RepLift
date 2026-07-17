/**
 * Connectivity = browser online status AND not dev-forced offline.
 * Single subscription point for the outbox scheduler and status UI.
 */

import { useSyncExternalStore } from 'react';
import { devSim, useDevSim } from '../stores/dev-sim';

export function isOnline(): boolean {
  const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  return browserOnline && !devSim.get().forceOffline;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

let wired = false;
function wireOnce() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  useDevSim.subscribe(notify);
}

export function onConnectivityChange(listener: Listener): () => void {
  wireOnce();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(onConnectivityChange, isOnline, () => true);
}
