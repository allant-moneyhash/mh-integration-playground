// External API and Direct API share one shape: your backend creates the intent
// and drives its state machine. Direct adds one thing: your server sends the raw
// card to the vault (PCI DSS merchants only).
// Docs: https://docs.moneyhash.io/docs/integration-types-external-api
//       https://docs.moneyhash.io/docs/integration-types-direct-api
// The browser names an action from a fixed list; it never chooses the MoneyHash path.
import { ENVIRONMENTS } from '@/lib/hosts';
import {
  LIVE_KEY_MESSAGE,
  LIVE_NOTE,
  RequestError,
  assertNotKnownLive,
  errorResponse,
  isLiveResponse,
  liveAllowed,
  mhCall,
  parseTarget,
  rememberLiveKey,
  resolveApiKey,
  type CallResult,
  type Target,
} from './mh';

export type ServerApi = 'external' | 'direct';
type Action =
  | 'create'
  | 'state'
  | 'update-method'
  | 'card-token'
  | 'pay-card'
  | 'pay-wallet'
  | 'applepay-session';
type SimpleAction = 'create' | 'state' | 'update-method' | 'card-token';
const WALLETS = ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY'];

const INTENT_ID = /^[A-Za-z0-9_-]{4,64}$/;
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const LABEL: Record<ServerApi, string> = {
  external: 'External',
  direct: 'Direct',
};

const ACTIONS: Record<
  SimpleAction,
  {
    method: 'GET' | 'POST';
    title: string;
    path: (id: string) => string;
    needsId: boolean;
  }
> = {
  create: {
    method: 'POST',
    title: 'create intent',
    path: () => '/payments/intent/',
    needsId: false,
  },
  state: {
    method: 'GET',
    title: 'get intent state',
    path: id => `/payments/intents/${id}/`,
    needsId: true,
  },
  'update-method': {
    method: 'POST',
    title: 'select payment method',
    path: id => `/payments/intents/${id}/update-method/`,
    needsId: true,
  },
  'card-token': {
    method: 'POST',
    title: 'pay with saved card',
    path: id => `/payments/intents/${id}/card_token/`,
    needsId: true,
  },
};

/** Hosts the Direct API vault URL may point to (never a URL the browser supplies). */
const VAULT_HOSTS: Record<string, string[]> = {
  staging: [new URL(ENVIRONMENTS.staging.vault).host, 'stg-vault.moneyhash.io'],
  production: [new URL(ENVIRONMENTS.production.vault).host],
};

function bodyFor(
  action: SimpleAction,
  body: unknown,
): Record<string, unknown> | undefined {
  if (action === 'state') return undefined;
  if (!isObject(body))
    throw new RequestError(400, 'The request body must be a JSON object.');
  if (action === 'create') return body;
  if (action === 'update-method') {
    if (typeof body.payment_method !== 'string' || !body.payment_method)
      throw new RequestError(400, 'Choose a payment method.');
    return { payment_method: body.payment_method };
  }
  if (typeof body.card_token_id !== 'string' || !body.card_token_id)
    throw new RequestError(400, 'Choose a saved card.');
  return {
    card_token_id: body.card_token_id,
    ...(typeof body.cvv === 'string' && body.cvv ? { cvv: body.cvv } : {}),
  };
}

type Card = {
  card_holder_name: string;
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
};

/**
 * The card as the form sent it. No playground checks:
 * MoneyHash validates the card and returns its own errors, which the page shows.
 * The card number and CVV are still masked in the console.
 */
function readCard(body: unknown): Card {
  const c = isObject(body) && isObject(body.card) ? body.card : {};
  const s = (k: string) =>
    typeof c[k] === 'string' ? (c[k] as string).trim() : '';
  return {
    card_holder_name: s('card_holder_name'),
    card_number: s('card_number').replace(/[\s-]/g, ''),
    expiry_month: s('expiry_month'),
    expiry_year: s('expiry_year'),
    cvv: s('cvv'),
  };
}

/** Direct API card payment: fetch a fresh vault URL (5-minute token), then post the card to it. */
async function payWithCard(
  target: Target,
  apiKey: string,
  id: string,
  card: Card,
  saveCard: boolean,
): Promise<CallResult[]> {
  const selected = await mhCall({
    target,
    apiKey,
    method: 'POST',
    path: `/direct/payments/intents/${id}/update-method/`,
    body: { payment_method: 'CARD' },
    title: 'Direct: select CARD (gets the vault URL)',
  });
  if (!selected.ok) return [selected];
  const meta = (
    selected.data as { data?: { state_details?: { meta?: { url?: unknown } } } }
  )?.data?.state_details?.meta;
  const raw = typeof meta?.url === 'string' ? meta.url : '';
  let vault: URL;
  try {
    vault = new URL(raw);
  } catch {
    throw new RequestError(
      502,
      'MoneyHash did not return a vault URL for the card. See the console.',
      [selected.entry],
    );
  }
  if (
    vault.protocol !== 'https:' ||
    !VAULT_HOSTS[target.env].includes(vault.host) ||
    !vault.pathname.includes(`/direct/payments/intents/${id}/`)
  ) {
    throw new RequestError(
      502,
      `Unexpected vault host ${vault.host}; the card was not sent.`,
      [selected.entry],
    );
  }
  const paid = await mhCall({
    target,
    apiKey,
    method: 'POST',
    path: '',
    url: vault.toString(),
    // save_card: the customer ticked "Save this card" (needs a customer and allow_tokenize_card on the intent).
    body: {
      native_form: {
        billing_fields: {},
        card_details: { ...card, save_card: saveCard },
      },
    },
    title: 'Direct: send card to the vault',
  });
  return [selected, paid];
}

/**
 * Wallet buttons the merchant renders itself (no SDK): the browser gets the
 * receipt from Apple / Google / Samsung, your server selects the wallet and posts
 * the receipt. MoneyHash decrypts it. Docs: .../receipt/ (External and Direct).
 */
function readWallet(body: unknown) {
  if (!isObject(body))
    throw new RequestError(400, 'The request body must be a JSON object.');
  const method =
    typeof body.payment_method === 'string' ? body.payment_method : '';
  if (!WALLETS.includes(method)) throw new RequestError(400, 'Unknown wallet.');
  if (
    typeof body.receipt !== 'string' ||
    !body.receipt ||
    body.receipt.length > 20_000
  )
    throw new RequestError(400, 'The wallet receipt is missing.');
  const billing = isObject(body.receipt_billing_data)
    ? body.receipt_billing_data
    : undefined;
  return {
    method,
    receipt: body.receipt,
    ...(billing ? { receipt_billing_data: billing } : {}),
  };
}

async function payWithWallet(
  target: Target,
  apiKey: string,
  api: ServerApi,
  id: string,
  w: ReturnType<typeof readWallet>,
): Promise<CallResult[]> {
  const selected = await mhCall({
    target,
    apiKey,
    method: 'POST',
    path: `/${api}/payments/intents/${id}/update-method/`,
    body: { payment_method: w.method },
    title: `${LABEL[api]}: select ${w.method}`,
  });
  if (!selected.ok) return [selected];
  const paid = await mhCall({
    target,
    apiKey,
    method: 'POST',
    path: `/${api}/payments/intents/${id}/receipt/`,
    body: {
      receipt: w.receipt,
      ...(w.receipt_billing_data
        ? { receipt_billing_data: w.receipt_billing_data }
        : {}),
    },
    title: `${LABEL[api]}: submit wallet receipt`,
  });
  return [selected, paid];
}

/** Apple Pay merchant validation from your server (what the SDK's validateApplePayMerchantSession does). */
function readAppleSession(req: Request, body: unknown) {
  if (!isObject(body))
    throw new RequestError(400, 'The request body must be a JSON object.');
  const methodId = typeof body.method_id === 'string' ? body.method_id : '';
  let validation: URL;
  try {
    validation = new URL(String(body.validation_url ?? ''));
  } catch {
    throw new RequestError(400, 'Apple did not provide a validation URL.');
  }
  if (!methodId)
    throw new RequestError(400, 'The Apple Pay method id is missing.');
  if (
    validation.protocol !== 'https:' ||
    !/(^|\.)apple\.com$/.test(validation.hostname)
  )
    throw new RequestError(400, 'That is not an Apple validation URL.');
  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  return {
    method_id: methodId,
    validation_url: validation.toString(),
    parent_origin: origin,
    ...(typeof body.merchant_identifier === 'string' && body.merchant_identifier
      ? { merchant_identifier: body.merchant_identifier }
      : {}),
  };
}

export async function handleIntentAction(req: Request, api: ServerApi) {
  try {
    const input = (await req.json().catch(() => null)) as {
      env?: unknown;
      apiVersion?: unknown;
      action?: unknown;
      intentId?: unknown;
      body?: unknown;
    } | null;
    const action = input?.action as Action | undefined;
    const known =
      action === 'pay-card'
        ? api === 'direct'
        : action === 'pay-wallet' ||
          action === 'applepay-session' ||
          (!!action && action in ACTIONS);
    if (!input || !action || !known)
      throw new RequestError(400, `Unknown ${LABEL[api]} API action.`);
    const id = typeof input.intentId === 'string' ? input.intentId : '';
    const needsId =
      action === 'pay-card' ||
      action === 'pay-wallet' ||
      ACTIONS[action as SimpleAction]?.needsId;
    if (needsId && !INTENT_ID.test(id)) {
      throw new RequestError(400, 'That intent ID does not look right.');
    }

    // Read and shape each action's body before any MoneyHash call.
    const card = action === 'pay-card' ? readCard(input.body) : null;
    const wallet = action === 'pay-wallet' ? readWallet(input.body) : null;
    const appleSession =
      action === 'applepay-session' ? readAppleSession(req, input.body) : null;

    const target = parseTarget(input.env, input.apiVersion);
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);

    let results: CallResult[];
    if (action === 'pay-card') {
      const body = input.body as { card?: { save_card?: unknown } } | undefined;
      results = await payWithCard(
        target,
        apiKey,
        encodeURIComponent(id),
        card!,
        body?.card?.save_card === true,
      );
    } else if (action === 'pay-wallet') {
      results = await payWithWallet(
        target,
        apiKey,
        api,
        encodeURIComponent(id),
        wallet!,
      );
    } else if (action === 'applepay-session') {
      results = [
        await mhCall({
          target,
          apiKey,
          method: 'POST',
          path: '/providers/applepay/session/',
          body: appleSession!,
          title: 'Apple Pay: validate merchant session',
        }),
      ];
    } else {
      const spec = ACTIONS[action as SimpleAction];
      results = [
        await mhCall({
          target,
          apiKey,
          method: spec.method,
          path: `/${api}${spec.path(encodeURIComponent(id))}`,
          body: bodyFor(action as SimpleAction, input.body),
          title: `${LABEL[api]}: ${spec.title}`,
        }),
      ];
    }
    const last = results[results.length - 1];
    const entries = results.map(r => r.entry);
    if (last.ok && isLiveResponse(last.data)) {
      // Same rule as the Payment API route: live intents only when MH_BLOCK_LIVE_KEYS is off.
      if (!liveAllowed()) {
        rememberLiveKey(apiKey);
        throw new RequestError(403, LIVE_KEY_MESSAGE, entries);
      }
      last.entry.note = LIVE_NOTE;
    }
    return Response.json(
      { ok: last.ok, status: last.status, data: last.data, entries },
      { status: last.ok ? 200 : 502 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
