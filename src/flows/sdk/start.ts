'use client';
import { createPaymentIntent } from '@/lib/api-client';
import type { IntentBody } from '@/lib/intent-body';
import type { Session } from '../session';
import { applyIntentSecret, createSdk } from './runtime';

/** Backend creates the intent; the browser gets an SDK with the secret applied (or not). */
export async function startIntent(session: Session, body: IntentBody) {
  const sdk = await createSdk(session);
  const res = await createPaymentIntent(session, body);
  applyIntentSecret(sdk, session, res.data.intent_secret);
  return { sdk, intentId: res.data.id };
}

export function sdkSecretNote(session: Session) {
  return session.useIntentSecret
    ? 'moneyHash.setIntentSecret(intent_secret) before any intent call'
    : 'setIntentSecret is not called. Accounts with "Require Intent Secret" will reject intent calls with 401.';
}
