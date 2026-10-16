// The order record a merchant backend keeps, derived only from webhooks.
import {
  outcomeFromWebhook,
  summariseIntent,
  type IntentSummary,
  type Outcome,
} from './intent-outcome';

export type OrderRecord = {
  intentId: string;
  outcome: Outcome;
  /** The webhook that set this outcome. */
  event: string;
  summary: IntentSummary;
  updatedAt: number;
};

type WebhookLike = {
  type: string;
  intentId: string | null;
  signature: 'valid' | 'invalid' | 'not checked';
  receivedAt: number;
  summary?: IntentSummary;
  /** Masked webhook payload; re-read so parser fixes apply to stored events too. */
  payload?: unknown;
};

/**
 * Success beats everything (a retry can succeed after a failure). "action" (order
 * placed, payment pending) can later become failed or success, never the reverse.
 */
const RANK: Record<Outcome, number> = {
  pending: 0,
  action: 1,
  failed: 2,
  success: 3,
};

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>;
}

/** Apply webhooks in arrival order. Invalid signatures never change the order. */
export function foldOrder(
  current: OrderRecord | null,
  events: WebhookLike[],
): OrderRecord | null {
  let order = current;
  for (const w of [...events].sort((a, b) => a.receivedAt - b.receivedAt)) {
    if (!w.intentId || w.signature === 'invalid') continue;
    const summary = w.payload
      ? summariseIntent(w.payload)
      : (w.summary ?? { outcome: 'pending' as Outcome });
    const outcome = outcomeFromWebhook(w.type) ?? summary.outcome;
    if (order && RANK[outcome] < RANK[order.outcome]) continue;
    // Keep details an earlier webhook had if this one lacks them (e.g. intent.processed has no transaction).
    const merged: IntentSummary = {
      ...(order?.summary ?? {}),
      ...stripEmpty(summary),
      outcome,
    };
    order = {
      intentId: w.intentId,
      outcome,
      event: w.type,
      summary: merged,
      updatedAt: w.receivedAt,
    };
  }
  return order;
}
