// Builds the payment intent request from the cart, customer and options.
// Rule from the go-live checklist: omit empty fields, never send null.
import type { CartLine } from '@/store/cart';
import type { Customer, EmbedOptionValues } from '@/store/config';
import { EMBED_OPTIONS, REDIRECT_KEYS } from '@/lib/embed-options';
import type { Currency } from '@/lib/catalog';
import type { EnvId } from '@/lib/hosts';

export type IntentBody = Record<string, unknown>;
/** Hand edits from the JSON editor, at top-level field granularity. */
export type IntentPatch = { set: Record<string, unknown>; removed: string[] };

type Input = {
  lines: CartLine[];
  total: number;
  currency: Currency;
  customer: Customer;
  options: EmbedOptionValues;
  origin: string;
  env: EnvId;
  /** Fields a flow adds on top (e.g. operation tweaks). */
  flowFields?: IntentBody;
};

export function orderPageUrl(origin: string) {
  return `${origin}/checkout/order`;
}

export function webhookUrl(origin: string, env: EnvId) {
  return `${origin}/api/webhooks?env=${env}`;
}

export function buildIntentBody({ lines, total, currency, customer, options, origin, env, flowFields }: Input): IntentBody {
  const order = orderPageUrl(origin);
  const body: IntentBody = {
    amount: total,
    amount_currency: currency,
    operation: 'purchase',
    billing_data: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone_number: customer.phone_number,
      address: customer.address,
      street: customer.street || customer.address,
      building: customer.building,
      floor: customer.floor,
      apartment: customer.apartment,
      city: customer.city,
      state: customer.state,
      postal_code: customer.postal_code,
      country: customer.country,
    },
    shipping_data: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone_number: customer.phone_number,
      address: customer.address,
      street: customer.street || customer.address,
      building: customer.building,
      floor: customer.floor,
      apartment: customer.apartment,
      city: customer.city,
      state: customer.state,
      postal_code: customer.postal_code,
      country: customer.country,
    },
    // Exactly as shop.moneyhash.io sends them. BNPL providers such
    // as Tamara and Tabby require these on every item; category, subcategory and type
    // are fixed MoneyHash choices, so use the shop's accepted values.
    product_items: lines.map((l, i) => ({
      name: `${l.product.name} (${l.product.color})`,
      description: l.product.description,
      quantity: l.quantity,
      amount: l.product.price[currency],
      category: 'Electronics',
      subcategory: 'Audio',
      type: 'Digital',
      sku: `sku${i}`,
      tax: 1,
    })),
    webhook_url: webhookUrl(origin, env),
    successful_redirect_url: order,
    failed_redirect_url: order,
    pending_external_action_redirect_url: order,
    back_url: order,
    redirect_branding_data: {
      icon: `${origin}/images/moneyhash-logo.png`,
      background_color: 'white',
      size: 200,
      animate: 'pulse',
    },
    ...flowFields,
  };

  for (const opt of EMBED_OPTIONS) {
    if (opt.where !== 'body') continue;
    const value = options[opt.key];
    if (value === undefined || value === '' || value === false) continue;
    if (opt.kind === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) body[opt.key] = n;
    } else if (opt.kind === 'list') {
      const list = String(value).split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) body[opt.key] = list;
    } else {
      body[opt.key] = value;
    }
  }
  // Empty redirect fields fall back to the order page (already set above).
  for (const k of REDIRECT_KEYS) if (!options[k]) body[k] = order;

  // flow_id and operation are mutually exclusive.
  if (body.flow_id) delete body.operation;
  return body;
}

export function applyPatch(base: IntentBody, patch: IntentPatch): IntentBody {
  const out: IntentBody = { ...base, ...patch.set };
  for (const k of patch.removed) delete out[k];
  return out;
}

/** Turn the editor's object into a patch against the generated body. */
export function diffToPatch(base: IntentBody, edited: IntentBody): IntentPatch {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edited)) {
    if (JSON.stringify(base[k]) !== JSON.stringify(v)) set[k] = v;
  }
  const removed = Object.keys(base).filter(k => !(k in edited));
  return { set, removed };
}

export function patchIsEmpty(p: IntentPatch) {
  return Object.keys(p.set).length === 0 && p.removed.length === 0;
}
