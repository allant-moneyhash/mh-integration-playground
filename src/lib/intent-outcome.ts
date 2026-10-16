// Turns a MoneyHash "get intent" response or a webhook into a plain outcome.
// The REST response nests its parts: { intent, transaction, payment_status, state }.

/**
 * success: paid · failed: declined/closed · action: order placed, payment happens
 * outside the store (Cash on Delivery, Bank Transfer…) · pending: not decided yet.
 */
export type Outcome = 'success' | 'failed' | 'action' | 'pending';

export type IntentSummary = {
  outcome: Outcome;
  intentStatus?: string;
  paymentStatus?: string;
  transactionStatus?: string;
  state?: string;
  amount?: string;
  isLive?: boolean;
  responseMessage?: string;
  transactionId?: string;
  paymentMethod?: string;
  /** e.g. "Provider - Card" */
  provider?: string;
  card?: string;
  /** Instructions from the provider (e.g. pay on delivery, bank details). May contain links. */
  actionMessages?: string[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * Works for the get-intent response ({ intent, transaction, … }), transaction
 * webhooks ({ intent, transaction }) and intent webhooks ({ data: { intent:
 * { active_transaction } } }) — shapes taken from real MoneyHash v1.4 payloads.
 */
export function summariseIntent(data: unknown): IntentSummary {
  const root = obj(data) ?? {};
  const inner = obj(root.data);
  const intent = obj(root.intent) ?? obj(inner?.intent) ?? root;
  const tx =
    obj(root.transaction) ??
    obj(inner?.transaction) ??
    obj(root.active_transaction) ??
    obj(intent.active_transaction) ??
    obj((root.transactions as unknown[] | undefined)?.[0]);
  const ps = root.payment_status ?? intent.payment_status;
  const paymentStatus = str(ps) ?? str(obj(ps)?.status);
  const transactionStatus = str(tx?.status);
  const intentStatus = str(intent.status);
  const state = str(root.state);
  const amount = obj(intent.amount);
  const details = obj(tx?.payment_method_details);
  const detailData = obj(details?.data);
  const ops = (tx?.operations as unknown[] | undefined) ?? [];
  const lastOp = obj(ops[ops.length - 1]);
  const latest = obj(lastOp?.latest_status);

  const last4 =
    str(detailData?.last_4) ??
    str(detailData?.last4) ??
    str(detailData?.card_last_four);
  const brand =
    str(detailData?.brand) ??
    str(detailData?.card_brand) ??
    str(detailData?.scheme);

  return {
    outcome: outcomeOf({
      paymentStatus,
      transactionStatus,
      intentStatus,
      state,
    }),
    intentStatus,
    paymentStatus,
    transactionStatus,
    state,
    isLive: intent.is_live === true || root.is_live === true,
    responseMessage:
      str(tx?.response_message) ??
      str(tx?.localized_response_message) ??
      str(latest?.localized_message) ??
      str(latest?.message),
    transactionId: str(tx?.id),
    paymentMethod:
      str(tx?.payment_method_name) ??
      str(details?.type) ??
      str(tx?.payment_method) ??
      str(obj(root.selected_method)?.title) ??
      str(root.selected_method),
    provider: str(obj(tx?.method)?.display_name),
    card: last4 ? `${brand ?? 'Card'} •••• ${last4}` : undefined,
    actionMessages: (() => {
      const list = actionLines(tx, intent, root);
      return list.length ? list : undefined;
    })(),
    amount:
      str(amount?.display_value) ??
      (amount?.value !== undefined
        ? `${amount.value} ${str(amount.currency) ?? str(intent.amount_currency) ?? ''}`.trim()
        : undefined),
  };
}

const label = (k: string) =>
  k.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Flattens a value MoneyHash sends as instructions into readable lines. */
function linesOf(v: unknown, prefix = '', depth = 0): string[] {
  if (depth > 4 || v === null || v === undefined || v === '') return [];
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return [prefix ? `${prefix}: ${v}` : String(v)];
  if (Array.isArray(v)) return v.flatMap(x => linesOf(x, prefix, depth + 1));
  const o = v as Obj;
  // Section-like objects: { title, value } / { label, value } / { key, value }.
  const name = str(o.title) ?? str(o.label) ?? str(o.key) ?? str(o.name);
  if (name && ('value' in o || 'text' in o))
    return linesOf(o.value ?? o.text, name, depth + 1);
  return Object.entries(o).flatMap(([k, x]) => linesOf(x, label(k), depth + 1));
}

/**
 * What the customer must do next for pending-external-action methods (Cash on
 * Delivery, bank transfer, Fawry…). external_action_message can be a list of
 * strings or a map, and v1.4 also sends external_sections; both can sit
 * on the transaction or the intent.
 */
function actionLines(...sources: (Obj | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (!s) continue;
    // The reference the customer pays with (e.g. Sadad/Edaat invoice number), as
    // MoneyHash's own pending page shows it too.
    const ref = obj(s.provider_unique_reference);
    const refKey = str(ref?.key);
    const refValue =
      str(ref?.value) ??
      (typeof ref?.value === 'number' ? String(ref.value) : undefined);
    if (refKey && refValue) out.push(`${label(refKey)}: ${refValue}`);
    for (const [k, v] of Object.entries(
      obj(s.provider_transaction_fields) ?? {},
    )) {
      if (k === refKey || v === null || v === '') continue;
      for (const line of linesOf(v, label(k)))
        if (!out.includes(line)) out.push(line);
    }
    for (const key of [
      'external_action_message',
      'externalActionMessage',
      'external_sections',
      'externalSections',
    ]) {
      for (const line of linesOf(s[key]))
        if (line.trim() && !out.includes(line)) out.push(line);
    }
  }
  return out;
}

function outcomeOf(s: {
  paymentStatus?: string;
  transactionStatus?: string;
  intentStatus?: string;
  state?: string;
}): Outcome {
  const ps = s.paymentStatus ?? '';
  const tx = (s.transactionStatus ?? '').toUpperCase();
  if (
    ['CAPTURED', 'AUTHORIZED'].includes(ps) ||
    tx.includes('SUCCESS') ||
    s.intentStatus === 'PROCESSED' ||
    s.state === 'INTENT_PROCESSED'
  ) {
    return 'success';
  }
  // Offline methods (Cash on Delivery, Bank Transfer, Pay at Fawry…): the order is
  // placed and the customer pays outside the store; the final result comes later.
  if (
    tx.includes('PENDING_EXTERNAL_ACTION') ||
    tx.includes('PENDING_ONLINE_EXTERNAL_ACTION') ||
    s.state === 'TRANSACTION_WAITING_USER_ACTION'
  ) {
    return 'action';
  }
  if (
    ['AUTHORIZE_ATTEMPT_FAILED', 'ABORTED', 'VOIDED'].includes(ps) ||
    tx.includes('FAIL') ||
    tx.includes('DECLIN') ||
    ['CLOSED', 'TIME_EXPIRED', 'EXPIRED'].includes(s.intentStatus ?? '') ||
    ['TRANSACTION_FAILED', 'EXPIRED', 'CLOSED'].includes(s.state ?? '')
  ) {
    return 'failed';
  }
  return 'pending';
}

/** What a webhook type says about the outcome, if anything. */
export function outcomeFromWebhook(type: string): Outcome | null {
  const t = type.toLowerCase();
  if (
    t === 'intent.processed' ||
    /^transaction\.(purchase|authorize|capture)\.successful$/.test(t)
  )
    return 'success';
  if (
    /^transaction\.(purchase|authorize)\.failed$/.test(t) ||
    t === 'intent.time_expired' ||
    t === 'intent.closed'
  )
    return 'failed';
  if (
    /^transaction\.(purchase|authorize)\.pending_(online_)?external_action$/.test(
      t,
    )
  )
    return 'action';
  return null;
}
