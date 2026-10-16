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
    'Look up the card before paying: typed cards with cardForm.binLookup (then a bank offer and installments decide the amount), wallets with binLookupByReceipt on the Apple Pay / Google Pay receipt.',
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
      source: 'Frontend SDK',
      label:
        'cardForm.binLookup({ cardData }) → brand, type, issuer, issuer country',
    },
    {
      source: 'Frontend SDK',
      label:
        'getInstallmentPlans({ first6Digits, amount, currency }) → plans for this card',
    },
    {
      source: 'Backend API',
      label:
        'Store applies its offer → POST /payments/intent/ with the final amount and payment_method CARD',
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
