'use client';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConsoleAttempt, ConsoleEntry } from '@/lib/console-types';
import type { OrderRecord } from '@/lib/order';
import { maskDeep } from '@/lib/mask';

/** Past checkouts kept in History (this browser only). */
const MAX_ATTEMPTS = 10;

type ConsoleState = {
  entries: ConsoleEntry[];
  /** Payment attempts, oldest first. Entries are grouped by these. */
  attempts: ConsoleAttempt[];
  currentAttemptId: string | null;
  /** Order records from the playground backend, set by webhooks. */
  orders: Record<string, OrderRecord>;
  add: (...entries: ConsoleEntry[]) => void;
  /** Starts a new attempt (e.g. "Headless (recommended)") and returns its id. */
  startAttempt: (label: string, runKey?: string) => string;
  /** Remembers which attempt created an intent, so its webhooks land there. */
  linkIntent: (intentId: string) => void;
  attemptForIntent: (intentId: string) => string | undefined;
  /** Closes the current checkout (it stays in History); the console shows nothing until the next one. */
  endAttempt: () => void;
  /** Makes an existing checkout the current one (e.g. the order page for its intent). */
  focusAttempt: (attemptId: string) => void;
  clear: () => void;
  /** Empties one checkout's log (the checkout itself stays, so new calls keep landing in it). */
  clearEntries: (attemptId: string) => void;
  /** Deletes one checkout from History, with its log. */
  removeAttempt: (attemptId: string) => void;
  setOrder: (order: OrderRecord) => void;
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

export const useConsole = create<ConsoleState>()(
  persist(
    (set, get) => ({
      entries: [],
      attempts: [],
      currentAttemptId: null,
      orders: {},
      // Entries are masked again on the way in, so nothing unmasked is ever
      // stored or shown, whichever code path produced it.
      add: (...entries) =>
        set(s => ({
          entries: [
            ...s.entries,
            ...entries.map(e => maskDeep({ ...e, attemptId: e.attemptId ?? s.currentAttemptId ?? undefined })),
          ].slice(-300),
        })),
      startAttempt: (label, runKey) => {
        const id = newId();
        set(s => {
          const attempts = [...s.attempts, { id, label, startedAt: Date.now(), intentIds: [], ...(runKey ? { runKey } : {}) }].slice(-MAX_ATTEMPTS);
          const keep = new Set(attempts.map(a => a.id));
          // Drop entries of checkouts that fell out of History (and any untagged leftovers).
          return { attempts, currentAttemptId: id, entries: s.entries.filter(e => e.attemptId && keep.has(e.attemptId)) };
        });
        return id;
      },
      linkIntent: intentId =>
        set(s => ({
          attempts: s.attempts.map(a => (a.id === s.currentAttemptId && !a.intentIds.includes(intentId) ? { ...a, intentIds: [...a.intentIds, intentId] } : a)),
        })),
      attemptForIntent: intentId => get().attempts.find(a => a.intentIds.includes(intentId))?.id,
      endAttempt: () => set({ currentAttemptId: null }),
      focusAttempt: attemptId => set(s => (s.attempts.some(a => a.id === attemptId) ? { currentAttemptId: attemptId } : {})),
      clear: () => set({ entries: [], attempts: [], currentAttemptId: null }),
      clearEntries: attemptId => set(s => ({ entries: s.entries.filter(e => e.attemptId !== attemptId) })),
      removeAttempt: attemptId =>
        set(s => ({
          attempts: s.attempts.filter(a => a.id !== attemptId),
          entries: s.entries.filter(e => e.attemptId !== attemptId),
          currentAttemptId: s.currentAttemptId === attemptId ? null : s.currentAttemptId,
        })),
      setOrder: order => set(s => ({ orders: { ...s.orders, [order.intentId]: order } })),
    }),
    // Local storage: the log survives the redirect to MoneyHash and back, and History
    // survives reloads. Everything in it is already masked.
    { name: 'mh-playground-console', storage: createJSONStorage(() => localStorage), version: 3 },
  ),
);

export { newId };
