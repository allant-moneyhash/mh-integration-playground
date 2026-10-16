'use client';
import { SdkCheckout } from '../sdk/checkout/sdk-checkout';
import { sdkSecretNote } from '../sdk/start';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout(props: FlowCheckoutProps) {
  return <SdkCheckout mode="methods-first" {...props} />;
}

export const sdkMethodsFirstFlow: IntegrationFlow = {
  id: 'sdk-methods-first',
  api: 'payment',
  category: 'sdk',
  label: 'Headless, methods first',
  summary: 'Recommended. Your own checkout UI lists methods, wallets and saved cards before any intent exists; your server creates the intent only when the customer picks one (no abandoned intents).',
  ready: true,
  usesEmbedUrl: false,
  steps: session => [
    { source: 'Frontend SDK', label: 'getMethods({ currency, amount, operation: purchase }) → methods, wallets, saved cards; a parallel authorize call adds BNPL (Tamara, Tabby)' },
    { source: 'Backend API', label: 'Customer picks a method → POST /payments/intent/ with payment_method and form_only' },
    { source: 'Frontend SDK', label: 'setIntentSecret(intent_secret), then getIntentDetails → FORM_FIELDS', secret: sdkSecretNote(session) },
    { source: 'Frontend SDK', label: 'Card: MoneyHash card fields → cardForm.collect() → cardForm.pay(); 3DS via renderUrl' },
    { source: 'Frontend SDK', label: 'Wallet: wallet sheet → proceedWith(method) → submitPaymentReceipt(receipt)' },
    { source: 'Webhook', label: 'MoneyHash posts webhooks to your backend; the order page shows the result' },
  ],
  Checkout,
};
