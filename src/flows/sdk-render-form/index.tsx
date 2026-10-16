'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntentForm, orderUrl } from '../sdk/checkout/sdk-checkout';
import { errorText } from '../sdk/checkout/card-form';
import { sdkSecretNote, startIntent } from '../sdk/start';
import type { Sdk } from '../sdk/runtime';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout({ intentBody, session }: FlowCheckoutProps) {
  const router = useRouter();
  const [ctx, setCtx] = useState<{ sdk: Sdk; intentId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      setCtx(await startIntent(session, intentBody));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  // renderForm draws MoneyHash's form at its own height and resolves when it completes or fails.
  if (ctx)
    return (
      <IntentForm
        sdk={ctx.sdk}
        intentId={ctx.intentId}
        onDetails={() => router.replace(orderUrl(ctx.intentId))}
      />
    );

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={pay} disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        Pay with renderForm
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export const sdkRenderFormFlow: IntegrationFlow = {
  id: 'sdk-render-form',
  api: 'payment',
  category: 'sdk',
  label: 'renderForm',
  summary:
    'Least UI work with the SDK: your server creates the intent and MoneyHash renders its full payment form (methods, wallets, saved cards) inside your page.',
  ready: true,
  usesEmbedUrl: false,
  steps: session => [
    {
      source: 'Backend API',
      label: 'POST /payments/intent/ (create intent, returns intent_secret)',
    },
    {
      source: 'Frontend SDK',
      label: 'moneyHash.setIntentSecret(...)',
      secret: sdkSecretNote(session),
    },
    {
      source: 'Frontend SDK',
      label:
        "moneyHash.renderForm({ selector, intentId, onHeightChange }) renders MoneyHash's form",
    },
    {
      source: 'Webhook',
      label:
        'MoneyHash posts webhooks to your backend; the order page shows the result',
    },
  ],
  Checkout,
};
