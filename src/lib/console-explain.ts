// Plain-English explanations for console entries, Stripe-style: what the call
// did, what MoneyHash answered, and for errors what to do next + a docs link.
// Docs links are only pages confirmed to exist on docs.moneyhash.io.
import type { ConsoleEntry } from './console-types';

const DOCS = 'https://docs.moneyhash.io';
export const DOC = {
  intent: `${DOCS}/docs/create-an-intent`,
  intentRef: `${DOCS}/reference/v11_payments_intent_create`,
  customerRef: `${DOCS}/reference/v11_customers_create`,
  sdk: `${DOCS}/docs/sdk-architecture`,
  jsSdk: `${DOCS}/docs/javascript-sdk`,
  cardForm: `${DOCS}/docs/build-card-form`,
  applePay: `${DOCS}/docs/integration-steps-apple-pay`,
  googlePay: `${DOCS}/docs/integration-steps-google-pay`,
  webhooks: `${DOCS}/docs/webhook-types`,
  signature: `${DOCS}/docs/webhooks-signature`,
  tokenize: `${DOCS}/docs/tokenize-cards`,
  sandbox: `${DOCS}/docs/sandbox`,
  modes: `${DOCS}/docs/integration-modes`,
  keys: `${DOCS}/docs/programmatic-access`,
  external: `${DOCS}/docs/integration-types-external-api`,
  // Sections of the SDK architecture page, one per call.
  sdkInit: `${DOCS}/docs/sdk-architecture#installation-and-initialization`,
  sdkStates: `${DOCS}/docs/sdk-architecture#intent-states`,
  methodsWithIntent: `${DOCS}/docs/sdk-architecture#with-an-intent`,
  methodsWithoutIntent: `${DOCS}/docs/sdk-architecture#without-an-intent`,
  proceed: `${DOCS}/docs/sdk-architecture#proceed-with-a-method`,
  intentDetails: `${DOCS}/docs/sdk-architecture#get-intent-details`,
  collectCard: `${DOCS}/docs/sdk-architecture#collect-card-information`,
  payCard: `${DOCS}/docs/sdk-architecture#pay-using-card-information`,
  saveCard: `${DOCS}/docs/sdk-architecture#save-card-for-future-use`,
  receiptBin: `${DOCS}/docs/sdk-architecture#receipt-bin-lookup-apple-pay--google-pay`,
  direct: `${DOCS}/docs/integration-types-direct-api`,
} as const;

export type Explanation = {
  /** One plain sentence: what happened. */
  summary: string;
  /** For errors: what went wrong and what to do. */
  fix?: string;
  docs?: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** What each intent state means for the page. */
const STATE: Record<string, string> = {
  METHOD_SELECTION: 'the customer now picks a payment method',
  FORM_FIELDS: 'MoneyHash wants the card (and any billing) details next',
  INTENT_FORM: 'this step is handled by MoneyHash’s own form (renderForm)',
  URL_TO_RENDER: 'the customer must complete a page such as 3DS; the page renders it',
  SAVED_CARD_CVV: 'the saved card needs its CVV',
  INSTALLMENT_PLANS: 'the customer picks an installment plan',
  OTP_FORM: 'the customer enters a one-time code from the provider',
  NATIVE_PAY: 'the wallet sheet should be shown',
  PROCESSING: 'the provider is still working; the page checks again shortly',
  TRANSACTION_WAITING_USER_ACTION: 'the customer must finish something outside the store',
  INTENT_PROCESSED: 'the payment is finished',
  TRANSACTION_FAILED: 'the payment attempt failed; the customer can retry',
  EXPIRED: 'the intent expired',
  CLOSED: 'the intent was closed',
};

function stateOf(response: unknown): string | undefined {
  const r = obj(response);
  return str(r?.state) ?? str(obj(r?.data)?.state);
}

/** What the intent asks for next after this call, if the response says. */
export function nextState(e: ConsoleEntry): { state: string; meaning: string } | null {
  if (e.source === 'Webhook' || !e.ok) return null;
  const s = stateOf(e.response);
  return s ? { state: s, meaning: STATE[s] ?? '' } : null;
}

export type Phase = 'setup' | 'pay' | 'result';
export const PHASE_LABEL: Record<Phase, { title: string; hint: string }> = {
  setup: { title: 'Set up the checkout', hint: 'Intent, SDK and the methods the customer can use' },
  pay: { title: 'Customer pays', hint: 'The chosen method, card details, 3DS or wallet' },
  result: { title: 'Result', hint: 'What MoneyHash told your backend' },
};

const SETUP_CALLS = ['List customer cards', 'Get agreement', 'Create payment intent', 'External: create intent', 'Direct: create intent', 'Create customer', 'setIntentSecret', 'getMethods', 'getIntentMethods', 'Close intent (live key detected)'];

/** Which part of the checkout a call belongs to. */
export function phaseOf(e: ConsoleEntry): Phase {
  if (e.source === 'Webhook' || e.title.startsWith('Fallback')) return 'result';
  if (SETUP_CALLS.includes(e.title)) return 'setup';
  return 'pay';
}

/**
 * Everything MoneyHash says about an error, flattened to text, keeping the
 * field each message is about (e.g. "product_items.sku: This field is required").
 */
function errorText(e: ConsoleEntry): string {
  const r = obj(e.response) ?? {};
  const status = obj(r.status);
  const parts = [str(r.message), str(r.error), str(r.detail), str(status?.message)].filter(Boolean) as string[];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') parts.push(path ? `${path}: ${v}` : v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, path));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        // "detail" and "non_field_errors" are containers, not field names.
        const key = k === 'detail' || k === 'non_field_errors' ? '' : k;
        walk(x, key ? (path ? `${path}.${key}` : key) : path);
      }
    }
  };
  walk(status?.errors ?? r.errors, '');
  return [...new Set(parts)].join(' · ');
}

/** Known error patterns → plain explanation and fix. */
function explainError(e: ConsoleEntry, fallbackDocs?: string): Explanation {
  const text = errorText(e);
  const code = e.status ?? Number(obj(e.response)?.code);
  const said = text ? `MoneyHash said: “${text}”.` : '';

  if (/Card\/Currency\/Class combination not supported/i.test(text)) {
    return {
      summary: 'The provider declined before 3DS: it does not accept this card for this currency.',
      fix: 'The connection this payment was routed to does not take this card in this currency. Use the provider’s test cards for this currency, or route the currency to another connection in your dashboard.',
      docs: DOC.sandbox,
    };
  }
  if (/EMI is not supported/i.test(text)) {
    return {
      summary: 'This account has no installment (EMI) plans for cards, so getInstallmentPlans has nothing to return.',
      fix: 'Nothing to fix in the request: installments need an installment provider and plans set up for card on this account (dashboard). The checkout carries on without plans.',
      docs: 'https://docs.moneyhash.io/docs/installment-plans',
    };
  }
  if (/invalid customer/i.test(text)) {
    return {
      summary: 'MoneyHash did not recognise the customer on this intent.',
      fix: 'Customers belong to one MoneyHash account. If the keys changed, create a test customer for these keys on the details page, or check out as a guest.',
      docs: DOC.customerRef,
    };
  }
  if (/cvv is required/i.test(text)) {
    return { summary: 'The saved card was sent without a CVV.', fix: 'Send the CVV in proceedWith metaData.cvv (the playground always asks for it now).', docs: DOC.tokenize };
  }
  if (/credentials were not provided|incorrect authentication|invalid (api )?key|invalid token/i.test(text) || code === 401) {
    const client = e.source === 'Frontend SDK';
    // Account-level calls (getMethods without an intent) only use the public key.
    const body = obj(e.request?.body);
    const intentScoped = client && !(e.title === 'getMethods' && !body?.intentId);
    return {
      summary: client ? 'MoneyHash did not accept the browser’s credentials.' : 'MoneyHash did not accept the API key.',
      fix: client
        ? intentScoped
          ? 'This call acts on an intent. Check “Intent secret” is on (accounts with “Require Intent Secret” reject calls without it) and that the public key matches this environment.'
          : 'Check the public key belongs to this account and environment (staging vs production). Add it in Config → Public API key.'
        : 'Check the secret key belongs to this account and environment (staging keys only work on Staging).',
      docs: client ? DOC.sdk : DOC.keys,
    };
  }
  if (/intent.?secret/i.test(text)) {
    return { summary: 'This call needed the intent secret.', fix: 'Turn “Intent secret” on so the page calls setIntentSecret after creating the intent.', docs: DOC.sdk };
  }
  if (/live/i.test(text) && code === 403) {
    return { summary: 'The request was stopped because the key is in live mode.', fix: 'Use a test-mode key, or allow live keys on this deployment.', docs: DOC.modes };
  }
  if (code === 403) return { summary: 'MoneyHash refused the request (forbidden).', fix: `${said} The key may lack permission for this action, or the request was blocked.`, docs: fallbackDocs };
  if (code === 404) return { summary: 'MoneyHash could not find it.', fix: `${said} Check the ID and that the environment matches where it was created.`, docs: fallbackDocs };
  if (code === 400 && /\b(sku|tax)\b/.test(text)) {
    return {
      summary: 'MoneyHash rejected the intent: a product line is missing fields this payment method requires.',
      fix: `${said} BNPL methods such as Tamara and Tabby need sku, tax, category, subcategory and type on every item in product_items.`,
      docs: DOC.intentRef,
    };
  }
  if (code === 400) return { summary: 'MoneyHash rejected the request as invalid.', fix: `${said} Fix the fields it names (for intents, edit the intent JSON).`, docs: fallbackDocs };
  if (code === 0) return { summary: 'MoneyHash could not be reached.', fix: 'Network problem or timeout. Try again.', docs: undefined };
  return { summary: 'The call failed.', fix: said || 'Open the details for the full response.', docs: fallbackDocs };
}

const SDK_CALLS: Record<string, { what: string; docs: string }> = {
  getMethods: { what: 'Asked MoneyHash which payment methods, wallets and saved cards are available.', docs: DOC.methodsWithoutIntent },
  getIntentMethods: { what: 'Asked MoneyHash which methods this intent can use.', docs: DOC.methodsWithIntent },
  getIntentDetails: { what: 'Read the intent’s current state, which tells the page what to show next.', docs: DOC.intentDetails },
  setIntentSecret: { what: 'Gave the SDK the intent secret, so the browser is allowed to act on this intent.', docs: DOC.sdkInit },
  proceedWith: { what: 'Told MoneyHash which method or saved card the customer chose.', docs: DOC.proceed },
  resetSelectedMethod: { what: 'Cleared the chosen method so the customer can pick another.', docs: DOC.proceed },
  'cardForm.collect': { what: 'MoneyHash’s secure fields sent the card to the vault and returned a token. Card data never touched the store.', docs: DOC.collectCard },
  'cardForm.pay': { what: 'Paid with the tokenised card.', docs: DOC.payCard },
  submitForm: { what: 'Sent the method’s form fields to MoneyHash.', docs: DOC.sdkStates },
  submitCvv: { what: 'Sent the saved card’s CVV.', docs: DOC.sdkStates },
  renderUrl: { what: 'Showed the page MoneyHash asked for (e.g. 3DS) and waited for the customer to finish it.', docs: DOC.sdkStates },
  renderForm: { what: 'Showed MoneyHash’s own payment form and waited for the customer to finish it.', docs: DOC.sdkStates },
  submitPaymentReceipt: { what: 'Sent the wallet’s encrypted receipt to MoneyHash to take the payment.', docs: DOC.googlePay },
  validateApplePayMerchantSession: { what: 'Asked MoneyHash to vouch for this site so Apple can open the Apple Pay sheet.', docs: DOC.applePay },
  'cardForm.binLookup': { what: 'Looked up the collected card’s brand, type, issuer and issuer country before any intent exists, so the store can price the order (bank offers, installments).', docs: 'https://docs.moneyhash.io/docs/collect-card-information' },
  getInstallmentPlans: { what: 'Listed the installment plans for this card BIN and amount, without an intent.', docs: 'https://docs.moneyhash.io/docs/installment-plans#retrieving-plans-without-intent-creation' },
  binLookupByReceipt: { what: 'Looked up the wallet card’s brand and issuer from its receipt.', docs: DOC.receiptBin },
  deleteCard: { what: 'Deleted a saved card for this customer.', docs: DOC.tokenize },
  selectInstallmentPlan: { what: 'Chose an installment plan.', docs: DOC.sdkStates },
};

const BACKEND_CALLS: Record<string, { what: string; docs: string }> = {
  'Create payment intent': { what: 'Your server created the payment intent (secret API key, server to server).', docs: DOC.intentRef },
  'Get payment intent': { what: 'Your server read the intent’s latest status from MoneyHash.', docs: DOC.intent },
  'List customer cards': {
    what: 'Your server listed every card saved on the customer. For a merchant-initiated charge, card_token is the card’s UUID id (not the short hashid the SDK shows).',
    docs: 'https://docs.moneyhash.io/reference/get-customer-saved-cards',
  },
  'Get agreement': {
    what: 'Your server checked the agreement a customer-present payment set up. MIT is only allowed while it is active for a provider; a 404 means no such agreement yet.',
    docs: 'https://docs.moneyhash.io/docs/recurring-payments',
  },
  'Create customer': { what: 'Your server created a MoneyHash customer to save cards against.', docs: DOC.customerRef },
  'Close intent (live key detected)': { what: 'Your server closed the intent because the key is in live mode.', docs: DOC.modes },
  'External: create intent': {
    what: 'Your server created the intent through the External API. The response already lists the payment methods and saved cards, so your own page can show them without the JS SDK.',
    docs: DOC.external,
  },
  'External: select payment method': { what: 'Your server told MoneyHash which method the customer picked; the response says what comes next.', docs: DOC.external },
  'External: pay with saved card': { what: 'Your server paid with the customer’s saved card token (and CVV when the card needs it).', docs: DOC.external },
  'External: get intent state': { what: 'Your server asked MoneyHash where the intent is now.', docs: DOC.external },
  'Direct: create intent': {
    what: 'Your server created the intent through the Direct API. Like the External API, the response lists the methods and saved cards, so your own page can show them.',
    docs: DOC.direct,
  },
  'Direct: select payment method': { what: 'Your server told MoneyHash which method the customer picked; the response says what comes next.', docs: DOC.direct },
  'Direct: select CARD (gets the vault URL)': {
    what: 'Your server selected CARD. The response carries state_details.meta.url, a vault URL valid for 5 minutes, where the card details go next.',
    docs: DOC.direct,
  },
  'Direct: send card to the vault': {
    what: 'Your server sent the card details to the MoneyHash vault (PCI DSS). The card number and CVV are masked here.',
    docs: DOC.direct,
  },
  'Direct: pay with saved card': { what: 'Your server paid with the customer’s saved card token (and CVV when the card needs it).', docs: DOC.direct },
  'Direct: get intent state': { what: 'Your server asked MoneyHash where the intent is now.', docs: DOC.direct },
};

// Wallet calls your server makes on the External / Direct API (your own wallet buttons).
for (const api of ['External', 'Direct'] as const) {
  const docs = api === 'External' ? DOC.external : DOC.direct;
  for (const w of ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY']) {
    BACKEND_CALLS[`${api}: select ${w}`] = { what: `Your server selected ${w.replace('_', ' ').toLowerCase()} for the intent, before sending the wallet receipt.`, docs };
  }
  BACKEND_CALLS[`${api}: submit wallet receipt`] = {
    what: 'Your server sent the encrypted wallet token from the customer’s device; MoneyHash decrypts it and charges the card behind it.',
    docs,
  };
}
// Each External / Direct call links to its step in the integration guide.
const EXT = (a: string) => `${DOC.external}#${a}`;
const DIR = (a: string) => `${DOC.direct}#${a}`;
const SECTION: Record<string, string> = {
  'External: create intent': EXT('step-1---create-a-payment-intent'),
  'External: select payment method': EXT('step-2---render-method-selection'),
  'External: pay with saved card': EXT('paying-with-a-saved-card-token'),
  'External: get intent state': EXT('how-it-works'),
  'External: submit wallet receipt': EXT('native-pay-flow-apple-pay--google-pay'),
  'Direct: create intent': DIR('step-1---create-a-payment-intent'),
  'Direct: select payment method': DIR('step-2---set-the-payment-method'),
  'Direct: select CARD (gets the vault URL)': DIR('step-2---set-the-payment-method'),
  'Direct: send card to the vault': DIR('step-3---collect-card-data-and-submit-to-the-vault'),
  'Direct: pay with saved card': DIR('paying-with-a-saved-card-token'),
  'Direct: get intent state': DIR('how-it-works'),
  'Direct: submit wallet receipt': DIR('api-reference'),
};
for (const w of ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY']) {
  SECTION[`External: select ${w}`] = EXT('native-pay-flow-apple-pay--google-pay');
  SECTION[`Direct: select ${w}`] = DIR('api-reference');
}
for (const [title, url] of Object.entries(SECTION)) if (BACKEND_CALLS[title]) BACKEND_CALLS[title].docs = url;

BACKEND_CALLS['Apple Pay: validate merchant session'] = {
  what: 'Your server asked MoneyHash to validate the Apple Pay merchant session for Apple’s sheet (what the SDK’s validateApplePayMerchantSession does).',
  docs: DOC.applePay,
};

const WEBHOOKS: Record<string, string> = {
  'transaction.purchase.successful': 'MoneyHash told your backend the payment succeeded. Fulfil the order on this, not on the redirect.',
  'transaction.purchase.failed': 'MoneyHash told your backend the payment attempt failed. The customer can retry on the same intent.',
  'transaction.purchase.pending_authentication': 'The payment is waiting for the customer to finish 3DS.',
  'transaction.purchase.pending_external_action':
    'The order is placed but the customer pays outside the store (e.g. Cash on Delivery, Bank Transfer). Show the provider’s instructions; a successful or failed webhook follows once they pay.',
  'transaction.purchase.pending_online_external_action':
    'The customer has to finish the payment on the provider’s side. A successful or failed webhook follows once they do.',
  'transaction.authorize.pending_external_action':
    'The order is placed but the customer completes the payment outside the store. A successful or failed webhook follows.',
  'transaction.authorize.successful': 'The payment was authorised (not captured yet).',
  'transaction.authorize.failed': 'The authorisation failed.',
  'transaction.capture.successful': 'The authorised payment was captured.',
  'intent.processed': 'The intent is finished. No more payments can happen on it.',
  'intent.time_expired': 'The intent expired before it was paid.',
  'intent.closed': 'The intent was closed.',
  'card_token.created': 'The customer’s card was saved as a token for next time.',
  'customer.created': 'A new MoneyHash customer was created.',
};

function webhookDetail(e: ConsoleEntry) {
  const r = obj(e.response) ?? {};
  const tx = obj(r.transaction) ?? obj(obj(obj(r.data)?.intent)?.active_transaction);
  const ops = (tx?.operations as unknown[] | undefined) ?? [];
  const latest = obj(obj(ops[ops.length - 1])?.latest_status);
  const message = str(latest?.message) ?? str(tx?.response_message);
  return message ? ` Provider message: “${message}”.` : '';
}

/** What had already happened in this checkout when the call was made, so the text matches the scenario. */
export type ExplainContext = { intentId?: string };

/** The intent created earlier in this checkout, if any (Payment, External or Direct API). */
export function contextBefore(entries: ConsoleEntry[], index: number): ExplainContext {
  for (let i = 0; i < index; i++) {
    const e = entries[i];
    if (!e.ok || !/create (payment )?intent$/i.test(e.title)) continue;
    const r = obj(e.response);
    const data = obj(r?.data);
    const id = str(obj(data?.intent)?.id) ?? str(data?.id);
    if (id) return { intentId: id };
  }
  return {};
}

export function explain(e: ConsoleEntry, ctx: ExplainContext = {}): Explanation {
  if (e.source === 'Webhook') {
    const base = WEBHOOKS[e.title] ?? 'MoneyHash sent your backend an event.';
    const failed = /failed/.test(e.title);
    const sig = e.note?.includes('INVALID') ? ' The signature did not match, so your backend ignored it.' : '';
    return { summary: base + (failed ? webhookDetail(e) : '') + sig, docs: e.note?.includes('INVALID') ? DOC.signature : DOC.webhooks };
  }
  if (e.source === 'Frontend SDK') {
    const call = SDK_CALLS[e.title];
    if (!e.ok) return explainError(e, call?.docs);
    let summary = call?.what ?? `Called moneyHash.${e.title}().`;
    if (e.title === 'getMethods') {
      const r = obj(e.response);
      const n = (k: string) => ((r?.[k] as unknown[] | undefined) ?? []).length;
      const req = obj(obj(e.request)?.body);
      const why = req?.intentId
        ? ' For this intent: one call returns its methods, wallets and the customer’s saved cards.'
        : req?.operation === 'authorize'
          ? ' Authorize-only methods: BNPL providers such as Tamara and Tabby only support authorize, so they need their own (parallel) call.'
          : ctx.intentId
            ? ` Account-level lookup by amount and currency, made after your server created intent ${ctx.intentId}: it reads what the intent response does not carry (e.g. native wallet config).`
            : ' No intent yet, so the store asked by amount and currency.';
      const forCustomer = !req?.intentId && req?.customer ? ' With customer, so it also returns that customer’s saved cards.' : '';
      const count = (k: string, one: string, many: string) => `${n(k)} ${n(k) === 1 ? one : many}`;
      summary += `${why}${forCustomer} Returned ${count('paymentMethods', 'method', 'methods')}, ${count('expressMethods', 'wallet', 'wallets')}, ${count('savedCards', 'saved card', 'saved cards')}.`;
    }
    const docs = e.title === 'getMethods' ? (obj(obj(e.request)?.body)?.intentId ? DOC.methodsWithIntent : DOC.methodsWithoutIntent) : call?.docs;
    return { summary: summary, docs };
  }
  if (e.source === 'Backend API') {
    const call = BACKEND_CALLS[e.title.replace(/^Fallback: /, '')];
    if (!e.ok) return explainError(e, call?.docs);
    const fallback = e.title.startsWith('Fallback') ? ' No final webhook had arrived yet, so the page checked directly.' : '';
    return { summary: (call?.what ?? 'Your server called MoneyHash.') + fallback, docs: call?.docs };
  }
  return { summary: e.note ?? e.title };
}
