'use client';
// Wallet tapped before any intent exists (your own Apple Pay / Google Pay button).
// Your server creates an External or Direct intent with the wallet as payment_method
// and posts the receipt straight away, with no update-method call. The Payment API
// has no server-side receipt endpoint, so a Payment API checkout uses an External
// intent for its own wallet buttons.
import type { NativeReceiptData } from '@moneyhash/js-sdk/headless';
import { serverIntentCall, type ServerApi } from '@/lib/api-client';
import type { Session } from './session';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};

export async function walletOnPay({
  session,
  api,
  intentBody,
  customerId,
  methodId,
  receipt,
}: {
  session: Session;
  api: ServerApi;
  intentBody: Obj;
  customerId?: string;
  methodId: string;
  receipt: NativeReceiptData;
}) {
  const body: Obj = {
    ...intentBody,
    payment_method: methodId,
    ...(customerId ? { customer: customerId } : {}),
  };
  // Payment API-only fields have no meaning on an External / Direct intent.
  delete body.form_only;
  delete body.hide_loader_message;
  const created = await serverIntentCall(session, api, 'create', { body });
  const intent = obj(obj(created.data).intent);
  const id = typeof intent.id === 'string' ? intent.id : '';
  if (!id)
    throw new Error('MoneyHash did not return an intent id. See the console.');
  const res = await serverIntentCall(session, api, 'pay-wallet', {
    intentId: id,
    body: {
      payment_method: methodId,
      receipt: receipt.receipt,
      ...(receipt.receiptBillingData
        ? { receipt_billing_data: receipt.receiptBillingData }
        : {}),
      already_selected: true,
    },
  });
  return {
    id,
    secret:
      typeof intent.intent_secret === 'string'
        ? intent.intent_secret
        : undefined,
    res,
  };
}

/** Where the wallet payment goes next: the order page, or the provider page to render. */
export function walletNext(res: { data?: unknown }) {
  const data = obj(res.data);
  const state = String(data.state ?? obj(data.intent).state ?? '');
  const details = obj(data.state_details);
  const url = details.embed_url ?? details.url;
  return { state, url: typeof url === 'string' ? url : undefined };
}
