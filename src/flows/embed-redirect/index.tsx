'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPaymentIntent } from '@/lib/api-client';
import { embedSecretNote, embedUrlFor } from '../session';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout({ intentBody, session }: FlowCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await createPaymentIntent(session, intentBody);
      const url = embedUrlFor(session, res.data);
      // A short pause so the create-intent call can be seen in the console before
      // leaving; the log lives in session storage, so it is still there on return.
      await new Promise(r => setTimeout(r, 1200));
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  // "Continue to payment" already asked to pay.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-subtle">
          <Loader2 className="size-4 animate-spin" /> Creating the intent, then
          sending you to MoneyHash…
        </p>
      )}
      {error && (
        <>
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="w-full" onClick={pay}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}

export const embedRedirectFlow: IntegrationFlow = {
  id: 'embed-redirect',
  api: 'payment',
  category: 'hosted',
  label: 'Embed page (redirect)',
  summary:
    'Your server creates the intent and sends the customer to the MoneyHash-hosted page.',
  ready: true,
  usesEmbedUrl: true,
  steps: session => [
    {
      source: 'Backend API',
      label: 'POST /payments/intent/ (create intent, returns embed_url)',
    },
    {
      source: 'Frontend',
      label: 'Redirect the browser to embed_url',
      secret: embedSecretNote(session),
    },
    {
      source: 'Webhook',
      label:
        'MoneyHash posts transaction and intent webhooks to your backend, which updates the order',
    },
    {
      source: 'Frontend',
      label:
        'Customer lands on the redirect URL; the order page shows the status your backend got from the webhook',
    },
  ],
  Checkout,
};
