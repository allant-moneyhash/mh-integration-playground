'use client';
// Asks the playground backend for new webhooks of one intent, adds them to the
// console and folds them into the order record. Mounted only where a page is
// waiting for the outcome (order page, iframe checkout); polls only while the
// tab is visible and stops as soon as the order is final.
import { useEffect } from 'react';
import { useConsole } from '@/store/console';
import { foldOrder } from '@/lib/order';
import type { StoredWebhook } from '@/lib/server/webhooks';

const POLL_MS = 2500;
const MAX_WATCH_MS = 5 * 60 * 1000;
/** Paid or failed. "Payment pending" (Cash on Delivery…) keeps listening for the final webhook. */
const isFinal = (o?: string) => o === 'success' || o === 'failed';

export function WebhookWatcher({ intentId }: { intentId: string | null }) {
  useEffect(() => {
    if (!intentId) return;
    if (isFinal(useConsole.getState().orders[intentId]?.outcome)) return;
    const started = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | null = null;
    const seen = new Set(
      useConsole
        .getState()
        .entries.filter(e => e.source === 'Webhook')
        .map(e => e.id),
    );

    const schedule = () => {
      if (!stopped && Date.now() - started < MAX_WATCH_MS)
        timer = setTimeout(poll, POLL_MS);
    };

    async function poll() {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return schedule();
      try {
        const q = new URLSearchParams({ intentId: intentId! });
        if (cursor) q.set('after', cursor);
        const res = await fetch(`/api/webhooks?${q}`, { cache: 'no-store' });
        if (res.ok) {
          const body = (await res.json()) as {
            events: StoredWebhook[];
            cursor: string | null;
          };
          cursor = body.cursor;
          const state = useConsole.getState();
          const fresh = body.events.filter(e => !seen.has(e.id));
          for (const e of fresh) seen.add(e.id);
          if (fresh.length) {
            const attemptId = state.attemptForIntent(intentId!);
            state.add(
              ...fresh.map(e => ({
                attemptId,
                id: e.id,
                ts: e.receivedAt,
                source: 'Webhook' as const,
                title: e.type,
                method: 'POST',
                endpoint: '/api/webhooks',
                response: e.payload,
                ok: e.signature !== 'invalid',
                note:
                  e.signature === 'valid'
                    ? 'Signature verified (v3)'
                    : e.signature === 'invalid'
                      ? 'Signature INVALID: ignored for the order'
                      : undefined,
              })),
            );
          }
          if (body.events.length) {
            const order = foldOrder(
              state.orders[intentId!] ?? null,
              body.events,
            );
            if (order) state.setOrder(order);
            if (isFinal(order?.outcome)) return; // final: stop polling
          }
        }
      } catch {
        // Network blips are fine; try again next tick.
      }
      schedule();
    }

    timer = setTimeout(poll, 300);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [intentId]);

  return null;
}
