'use client';
// External and Direct API experiences. The checkout page is one flow whose steps
// follow the settings (card entry, wallets, 3DS).
import { embedSecretNote } from '../session';
import type { CheckoutSettings } from '../selection';
import type { BackendApi, FlowCheckoutProps, FlowStep, IntegrationFlow } from '../types';
import { ServerDrivenCheckout } from './checkout';
import { MitCheckout, ServerHosted, ServerRenderForm } from './more';

type ServerApi = 'external' | 'direct';
const LABEL = { external: 'External', direct: 'Direct' } as const;
const webhookStep: FlowStep = { source: 'Webhook', label: 'MoneyHash posts webhooks to your backend; the order page shows the result' };

export function serverCheckoutFlow(api: ServerApi, settings: CheckoutSettings): IntegrationFlow {
  const { cardEntry, wallets, threeDs } = settings;
  const steps = (session: Parameters<IntegrationFlow['steps']>[0]): FlowStep[] => [
    { source: 'Backend API', label: `POST /${api}/payments/intent/ → METHOD_SELECTION with payment_methods, express_methods and saved_cards` },
    wallets === 'own'
      ? {
          source: 'Backend API',
          label: `Wallet: your Apple Pay / Google Pay button → Apple session via POST /providers/applepay/session/ → update-method + POST /${api}/payments/intents/{id}/receipt/`,
        }
      : { source: 'Frontend SDK', label: 'Wallet: SDK wallet button → proceedWith + submitPaymentReceipt on the same intent' },
    { source: 'Backend API', label: `Saved card: POST /${api}/payments/intents/{id}/card_token/ { card_token_id, cvv }` },
    { source: 'Backend API', label: `Other methods: POST /${api}/payments/intents/{id}/update-method/ { payment_method }` },
    cardEntry === 'own'
      ? {
          source: 'Backend API',
          label: 'Card (your own form): your server calls update-method { CARD } → state_details.meta.url (5-minute vault URL) → POST the card to it',
        }
      : cardEntry === 'sdk'
        ? { source: 'Frontend SDK', label: 'Card: SDK card fields → cardForm.collect() → cardForm.pay({ intentId })' }
        : { source: 'Frontend', label: 'Card: MoneyHash embed for the intent in an iframe', secret: embedSecretNote(session) },
    threeDs === 'page'
      ? { source: 'Frontend', label: '3DS and provider pages: show state_details.embed_url from your server’s response in a frame' }
      : { source: 'Frontend', label: '3DS and provider pages: redirect the customer to state_details.embed_url' },
    { source: 'Frontend SDK', label: 'OTP, instalment plans, saved-card CVV: the SDK takes over on the same intent (no API endpoint yet)' },
    webhookStep,
  ];
  return {
    id: `${api}-checkout`,
    api,
    category: cardEntry === 'own' ? 'own' : cardEntry === 'sdk' ? 'sdk' : 'hosted',
    label: 'Your checkout page',
    summary: '',
    ready: true,
    usesEmbedUrl: cardEntry === 'embed',
    // The embed sits in an iframe: keep 3DS and provider pages inside it, not in a new tab.
    // 3DS in the page shows the embed in a frame too.
    ...(cardEntry === 'embed' || threeDs === 'page' ? { intentFields: () => ({ redirect_strategy: 'redirect_inside_embed' }) } : {}),
    steps,
    Checkout: (p: FlowCheckoutProps) => <ServerDrivenCheckout {...p} api={api} settings={settings} />,
  };
}

export function serverRenderFormFlow(api: ServerApi): IntegrationFlow {
  return {
    id: `${api}-form`,
    api,
    category: 'sdk',
    label: 'MoneyHash form in your page',
    summary: '',
    ready: true,
    usesEmbedUrl: false,
    steps: session => [
      { source: 'Backend API', label: `POST /${api}/payments/intent/ (returns intent_secret)` },
      { source: 'Frontend SDK', label: 'setIntentSecret(intent_secret)', secret: session.useIntentSecret ? 'Sent to the SDK' : 'Not sent (switch off)' },
      { source: 'Frontend SDK', label: 'renderForm({ selector, intentId, onHeightChange })' },
      webhookStep,
    ],
    Checkout: (p: FlowCheckoutProps) => <ServerRenderForm {...p} api={api} />,
  };
}

export function serverHostedFlow(api: ServerApi, mode: CheckoutSettings['hosted']): IntegrationFlow {
  return {
    id: `${api}-hosted`,
    api,
    category: 'hosted',
    label: 'MoneyHash hosted page',
    summary: '',
    ready: true,
    usesEmbedUrl: true,
    ...(mode === 'iframe' ? { intentFields: () => ({ redirect_strategy: 'redirect_inside_embed' }) } : {}),
    steps: session => [
      { source: 'Backend API', label: `POST /${api}/payments/intent/ (returns intent id and intent_secret)` },
      {
        source: 'Frontend',
        label: mode === 'iframe' ? 'Load the embed URL for the intent in an iframe' : 'Redirect the customer to the embed URL',
        secret: embedSecretNote(session),
      },
      webhookStep,
    ],
    Checkout: (p: FlowCheckoutProps) => <ServerHosted {...p} api={api} mode={mode} />,
  };
}

const API_PATH = { payment: '/payments/intent/', external: '/external/payments/intent/', direct: '/direct/payments/intent/' } as const;

/** Merchant-initiated charge of a saved card, on any backend API. */
export function mitFlow(api: BackendApi): IntegrationFlow {
  return {
    id: `${api}-mit`,
    api,
    category: 'none',
    label: 'No customer present',
    summary: '',
    ready: true,
    usesEmbedUrl: false,
    steps: () => [
      { source: 'Backend API', label: 'Cards on file: GET /customers/{id}/cards/ (card_token = the card’s UUID id; expired cards refused)' },
      { source: 'Backend API', label: 'Agreement from the customer-present payment: GET /agreements/{agreement_id}/ must be active' },
      {
        source: 'Backend API',
        label: `POST ${API_PATH[api]} { card_token, customer, merchant_initiated: true, payment_type: UNSCHEDULED, recurring_data.agreement_id }`,
      },
      webhookStep,
    ],
    Checkout: (p: FlowCheckoutProps) => <MitCheckout {...p} api={api} />,
  };
}

export { LABEL as SERVER_API_LABEL };
