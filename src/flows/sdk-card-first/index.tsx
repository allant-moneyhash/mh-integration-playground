'use client';
import { CardFirstCheckout } from '../sdk/checkout/card-first';
import { sdkSecretNote } from '../sdk/start';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout(props: FlowCheckoutProps) {
  return <CardFirstCheckout {...props} />;
}

export const sdkCardFirstFlow: IntegrationFlow = {
  id: 'sdk-card-first',
  api: 'payment',
  category: 'sdk',
  label: 'Headless, BIN lookup first',
  summary:
    'Know the card before the intent exists: a bank coupon is checked against the bank’s eligible BINs using the collected card, then the intent is created for the final amount. Optional BIN lookup and installments; wallets use binLookupByReceipt.',
  ready: true,
  usesEmbedUrl: false,
  steps: session => [
    {
      source: 'Frontend SDK',
      label:
        'getMethods({ currency, amount }) → wallet buttons (nativePayData)',
    },
    {
      source: 'Frontend SDK',
      label:
        'Wallet: receipt → binLookupByReceipt({ nativeReceiptData, methodId }) → intent → proceedWith → submitPaymentReceipt',
    },
    {
      source: 'Frontend SDK',
      label: 'Card: MoneyHash card fields → cardForm.collect() (no intent yet)',
    },
    {
      source: 'Playground',
      label:
        'Your store: coupon code checked against the bank’s eligible BINs with cardData.first_six_digits (no MoneyHash call)',
    },
    {
      source: 'Frontend SDK',
      label:
        'Optional: cardForm.binLookup({ cardData }) → issuer, type, country; getInstallmentPlans → plans',
    },
    {
      source: 'Backend API',
      label:
        'POST /payments/intent/ with the discounted amount and payment_method CARD',
    },
    {
      source: 'Frontend SDK',
      label:
        'cardForm.pay({ intentId, cardData, installmentPlanData? }); 3DS via renderUrl',
      secret: sdkSecretNote(session),
    },
    {
      source: 'Webhook',
      label:
        'MoneyHash posts webhooks to your backend; the order page shows the result',
    },
  ],
  Checkout,
};
