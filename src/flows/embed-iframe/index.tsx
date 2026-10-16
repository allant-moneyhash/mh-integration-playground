'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPaymentIntent } from '@/lib/api-client';
import { embedSecretNote, embedUrlFor } from '../session';
import { useWebhookRedirect } from '../use-webhook-redirect';
import { WebhookWatcher } from '@/components/webhook-watcher';
import type { FlowCheckoutProps, IntegrationFlow } from '../types';

function Checkout({ intentBody, session }: FlowCheckoutProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useWebhookRedirect(intentId);
  // "Continue to payment" already asked to pay: create the intent right away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await createPaymentIntent(session, intentBody);
      const url = embedUrlFor(session, res.data);
      setIntentId(res.data.id);
      setEmbedUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (embedUrl) {
    return (
      <div className="space-y-3">
        {/* Waits for the final webhook so the store can move on by itself. */}
        <WebhookWatcher intentId={intentId} />
        <iframe
          src={embedUrl}
          title="MoneyHash checkout"
          allow="payment *"
          className="h-[700px] w-full rounded-md border bg-background"
        />
        <p className="text-xs text-subtle">
          When MoneyHash sends the final webhook, your backend updates the order and this page moves on by itself.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-subtle">
          <Loader2 className="size-4 animate-spin" /> Creating the intent…
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

export const embedIframeFlow: IntegrationFlow = {
  id: 'embed-iframe',
  api: 'payment',
  category: 'hosted',
  label: 'Embed in iframe',
  summary: 'Your server creates the intent; MoneyHash checkout loads inside an iframe on your page.',
  ready: true,
  usesEmbedUrl: true,
  // In an iframe, keep 3DS and provider pages inside the embed instead of a new tab
  // (the account default). "Redirect strategy" in the embed options overrides it.
  intentFields: () => ({ redirect_strategy: 'redirect_inside_embed' }),
  steps: session => [
    { source: 'Backend API', label: 'POST /payments/intent/ (create intent, returns embed_url)' },
    { source: 'Frontend', label: 'Load embed_url in an <iframe>', secret: embedSecretNote(session) },
    { source: 'Webhook', label: 'MoneyHash posts transaction and intent webhooks to your backend, which updates the order' },
    { source: 'Frontend', label: 'Order turns final from the webhook, so the store redirects to the order page' },
  ],
  Checkout,
};
