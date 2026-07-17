/**
 * Dev-simulation controls (the "chaos toolbar"): force offline, add latency,
 * inject failure rates, and trigger other-device edits — so every loading /
 * offline / failure / conflict state is exercisable on demand.
 * Persisted so a reload keeps the simulation active. Rendered only in dev
 * builds, but kept in the bundle path so Playwright can drive it.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevSimState {
  /** simulate no connectivity (outbox queues, nothing reaches the mock server) */
  forceOffline: boolean;
  /** artificial round-trip latency (ms) for every mock API call */
  latencyMs: number;
  /** probability [0,1] that any mock API call fails with a 503 */
  failureRate: number;
  /** simulate the AI provider being down (NL parsing falls back gracefully) */
  aiDown: boolean;
  setForceOffline(v: boolean): void;
  setLatencyMs(v: number): void;
  setFailureRate(v: number): void;
  setAiDown(v: boolean): void;
  reset(): void;
}

export const useDevSim = create<DevSimState>()(
  persist(
    (set) => ({
      forceOffline: false,
      latencyMs: 250,
      failureRate: 0,
      aiDown: false,
      setForceOffline: (forceOffline) => set({ forceOffline }),
      setLatencyMs: (latencyMs) => set({ latencyMs }),
      setFailureRate: (failureRate) => set({ failureRate }),
      setAiDown: (aiDown) => set({ aiDown }),
      reset: () => set({ forceOffline: false, latencyMs: 250, failureRate: 0, aiDown: false }),
    }),
    { name: 'replift-dev-sim' },
  ),
);

/** Non-hook access for the mock transport / outbox (outside React). */
export const devSim = {
  get: () => useDevSim.getState(),
  subscribe: useDevSim.subscribe,
};
