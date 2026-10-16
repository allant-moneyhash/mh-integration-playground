'use client';
// Browser -> playground server. Every response carries already-masked console
// entries, which go straight into the console panel.
import type { ConsoleEntry } from '@/lib/console-types';
import type { Session } from '@/flows/session';
import { useConsole } from '@/store/console';
import { useOrders } from '@/store/orders';

type ServerResult<T> = { ok: boolean; status?: number; data?: T; entries?: ConsoleEntry[]; error?: string };

export class PlaygroundError extends Error {}

/** Pull the human-readable part out of MoneyHash's {status:{message, errors[]}} envelope. */
function mhErrorText(data: unknown): string {
  const status = (data as { status?: { message?: unknown; errors?: unknown } } | undefined)?.status;
  const parts: string[] = [];
  if (typeof status?.message === 'string' && status.message) parts.push(status.message);
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') parts.push(path ? `${path}: ${v}` : v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, path));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k === 'detail' ? path : path ? `${path}.${k}` : k);
  };
  walk(status?.errors, '');
  return parts.slice(0, 3).join('; ');
}

/** `log: false` skips the console (for quiet polling); entries are returned so the caller can log the one that matters. */
async function call<T>(
  session: Session,
  path: string,
  init: RequestInit,
  opts: { log?: boolean; onEntries?: (e: ConsoleEntry[]) => void; noConsole?: boolean } = {},
): Promise<T> {
  const log = opts.log ?? true;
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  // A key typed in Config goes to our server per request, over HTTPS. Never stored.
  if (session.apiKey) headers.set('x-mh-api-key', session.apiKey);

  let json: ServerResult<T>;
  try {
    const res = await fetch(path, { ...init, headers, cache: 'no-store' });
    json = (await res.json()) as ServerResult<T>;
  } catch {
    throw new PlaygroundError('Could not reach the playground server.');
  }

  opts.onEntries?.(json.entries ?? []);
  if (log && json.entries?.length) useConsole.getState().add(...json.entries);
  // Errors show next to the Pay button; the console is only for MoneyHash traffic.
  if (json.error) throw new PlaygroundError(json.error);
  if (!json.ok) {
    const detail = mhErrorText(json.data);
    // Customers belong to one MoneyHash account: a customer saved with other keys is rejected.
    const hint = /invalid customer/i.test(detail)
      ? ' This customer belongs to a different MoneyHash account (were the keys changed?). Go back to the details page and create a test customer for these keys, or check out as a guest.'
      : json.status === 401 || json.status === 403
        ? ` MoneyHash did not accept the secret API key for ${session.env === 'production' ? 'Production' : 'Staging'}. In Config, check it is the secret key (not the public one) from the ${session.env === 'production' ? 'Production' : 'Staging'} dashboard, or switch Environment to match the key.`
        : '';
    throw new PlaygroundError(`MoneyHash returned ${json.status}${detail ? `: ${detail}` : ''}.${hint || (opts.noConsole ? '' : ' Full response in the console.')}`);
  }
  return json.data as T;
}

export type MhEnvelope<T> = { status?: unknown; data: T };

export type PaymentIntent = {
  id: string;
  embed_url?: string;
  intent_secret?: string;
  status?: string;
  state?: string;
  is_live?: boolean;
  state_details?: { embed_url?: string };
  [k: string]: unknown;
};

export async function createPaymentIntent(session: Session, intent: Record<string, unknown>) {
  const res = await call<MhEnvelope<PaymentIntent>>(session, '/api/mh/payment-intents', {
    method: 'POST',
    body: JSON.stringify({ env: session.env, apiVersion: session.apiVersion, intent }),
  });
  // Remember what was bought for the order page, and which console attempt owns the intent.
  if (res.data?.id) {
    useOrders.getState().snapshot(res.data.id);
    useConsole.getState().linkIntent(res.data.id);
  }
  return res;
}

/** Creates a customer; returns its id (MoneyHash may or may not wrap it in `data`). */
export async function createCustomer(session: Session, customer: Record<string, string>) {
  const res = await call<{ data?: { id?: string }; id?: string }>(session, '/api/mh/customers', {
    method: 'POST',
    body: JSON.stringify({ env: session.env, apiVersion: session.apiVersion, customer }),
  }, { noConsole: true });
  const id = res?.data?.id ?? res?.id;
  if (!id) throw new PlaygroundError('MoneyHash did not return a customer id.');
  return id;
}

export function getPaymentIntent(
  session: Session,
  id: string,
  opts: { log?: boolean; onEntries?: (e: ConsoleEntry[]) => void } = {},
) {
  const q = new URLSearchParams({ env: session.env, apiVersion: session.apiVersion });
  return call<MhEnvelope<Record<string, unknown>>>(
    session,
    `/api/mh/payment-intents/${encodeURIComponent(id)}?${q}`,
    { method: 'GET' },
    opts,
  );
}

export type ServerApi = 'external' | 'direct';
export type IntentAction = 'create' | 'state' | 'update-method' | 'card-token' | 'pay-card' | 'pay-wallet' | 'applepay-session';

/** External / Direct API: our server calls /{api}/payments/… with the secret key. 'pay-card' is Direct only. */
export async function serverIntentCall(
  session: Session,
  api: ServerApi,
  action: IntentAction,
  args: { intentId?: string; body?: Record<string, unknown> } = {},
) {
  const res = await call<MhEnvelope<Record<string, unknown>>>(session, `/api/mh/${api}`, {
    method: 'POST',
    body: JSON.stringify({ env: session.env, apiVersion: session.apiVersion, action, ...args }),
  });
  if (action === 'create') {
    const intent = (res.data?.intent ?? res.data) as { id?: string } | undefined;
    if (intent?.id) {
      useOrders.getState().snapshot(intent.id);
      useConsole.getState().linkIntent(intent.id);
    }
  }
  return res;
}

export type CustomerCard = {
  /** UUID: what card_token must be for a server-side (MIT) charge. */
  id: string;
  /** Short id the SDK uses. */
  hashid?: string;
  brand?: string;
  last_4?: string;
  expiry_month?: string;
  expiry_year?: string;
  requires_cvv?: boolean;
  card_holder_name?: string;
};

/** Every saved card on a customer, unfiltered (GET /customers/{id}/cards/). */
export async function listCustomerCards(session: Session, customerId: string): Promise<CustomerCard[]> {
  const q = new URLSearchParams({ env: session.env, apiVersion: session.apiVersion });
  const res = await call<Record<string, unknown>>(session, `/api/mh/customers/${encodeURIComponent(customerId)}/cards?${q}`, { method: 'GET' });
  const data = (res as { data?: unknown }).data ?? res;
  const list = Array.isArray(data) ? data : ((data as { results?: unknown[] })?.results ?? []);
  return list.filter((c): c is CustomerCard => !!c && typeof (c as CustomerCard).id === 'string');
}

/** Agreement lookup; status 404 means no customer-present payment has set it up yet. */
export async function getAgreement(session: Session, agreementId: string) {
  const q = new URLSearchParams({ env: session.env, apiVersion: session.apiVersion });
  const res = await fetch(`/api/mh/agreements/${encodeURIComponent(agreementId)}?${q}`, {
    headers: session.apiKey ? { 'x-mh-api-key': session.apiKey } : {},
    cache: 'no-store',
  });
  const json = (await res.json()) as { ok?: boolean; status?: number; data?: unknown; entries?: ConsoleEntry[]; error?: string };
  if (json.entries?.length) useConsole.getState().add(...json.entries);
  if (json.error) throw new PlaygroundError(json.error);
  return { found: !!json.ok, status: json.status ?? 0, data: json.data };
}
