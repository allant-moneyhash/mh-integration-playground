'use client';
import { SdkCheckout } from '../sdk/checkout/sdk-checkout';
import { sdkSecretNote } from '../sdk/start';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout(props: FlowCheckoutProps) {
  return <SdkCheckout mode="intent-first" {...props} />;
}

export const sdkIntentFirstFlow: IntegrationFlow = {
  id: 'sdk-intent-first',
  api: 'payment',
  category: 'sdk',
  label: 'Headless, intent first',
  summary:
    'Your own checkout UI, but your server creates the intent up front (e.g. to fix the amount or apply a flow); one getMethods call lists its methods, wallets and saved cards.',
  ready: true,
  usesEmbedUrl: false,
  steps: session => [
    {
      source: 'Backend API',
      label:
        'POST /payments/intent/ (no payment_method yet, form_only) → METHOD_SELECTION',
    },
    {
      source: 'Frontend SDK',
      label: 'setIntentSecret(intent_secret)',
      secret: sdkSecretNote(session),
    },
    {
      source: 'Frontend SDK',
      label:
        'getMethods({ intentId }) → payment methods, wallets and saved cards in one call',
    },
    {
      source: 'Frontend SDK',
      label:
        'proceedWith({ type: "method", id }) → FORM_FIELDS → cardForm.collect() + pay()',
    },
    {
      source: 'Webhook',
      label:
        'MoneyHash posts webhooks to your backend; the order page shows the result',
    },
  ],
  Checkout,
};
