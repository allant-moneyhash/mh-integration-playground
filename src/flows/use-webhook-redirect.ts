'use client';
// Webhook-driven redirect: when the backend's order record for this intent
// turns final (because a webhook arrived), send the customer to the order page.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useConsole } from '@/store/console';

export function useWebhookRedirect(intentId: string | null) {
  const router = useRouter();
  const order = useConsole(s => (intentId ? s.orders[intentId] : undefined));
  const done = useRef(false);

  useEffect(() => {
    if (!intentId || !order || order.outcome === 'pending' || done.current)
      return;
    done.current = true;
    router.push(`/checkout/order?intent_id=${encodeURIComponent(intentId)}`);
  }, [intentId, order, router]);
}
