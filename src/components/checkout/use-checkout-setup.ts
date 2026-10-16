'use client';
// Everything both checkout steps need: the cart, the chosen flow, the session and
// the final intent request (generated from the cart and details + hand edits).
import { useMemo } from 'react';
import { resolveFlow } from '@/flows/registry';
import { resolveSession } from '@/flows/session';
import { applyPatch, buildIntentBody } from '@/lib/intent-body';
import { cartLines, cartTotal, useCart } from '@/store/cart';
import { useConfig } from '@/store/config';
import { useKeys } from '@/store/keys';

export function useCheckoutSetup() {
  const { quantities, currency, setCurrency } = useCart();
  const cfg = useConfig();
  const keys = useKeys();
  const lines = cartLines(quantities, currency);
  const total = cartTotal(lines, currency);
  const flow = resolveFlow(cfg.selection);

  const session = useMemo(
    () => resolveSession(cfg, keys),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.env, cfg.apiVersion, cfg.useIntentSecret, cfg.embedOptions, keys.apiKey, keys.publicApiKey],
  );

  const generated = useMemo(
    () =>
      buildIntentBody({
        lines,
        total,
        currency,
        customer: cfg.customer,
        options: cfg.embedOptions,
        origin: window.location.origin,
        env: cfg.env,
        flowFields: { ...flow.intentFields?.(session), ...(cfg.paymentFlowId.trim() ? { flow_id: cfg.paymentFlowId.trim() } : {}) },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quantities, currency, cfg.customer, cfg.embedOptions, cfg.env, cfg.paymentFlowId, flow.id, session],
  );
  const final = useMemo(() => applyPatch(generated, cfg.intentPatch), [generated, cfg.intentPatch]);

  return { cfg, keys, lines, total, currency, setCurrency, flow, session, generated, final };
}
