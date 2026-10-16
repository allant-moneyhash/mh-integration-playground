// The flow to run is derived from the selection: backend API, checkout
// experience and its settings. All three APIs offer the same experiences; the
// differences are about card data (only Direct takes your own card form; External
// needs MoneyHash's iframes for the card) and who makes each call.
import { embedIframeFlow } from './embed-iframe';
import { embedRedirectFlow } from './embed-redirect';
import { sdkRenderFormFlow } from './sdk-render-form';
import { sdkIntentFirstFlow } from './sdk-intent-first';
import { sdkMethodsFirstFlow } from './sdk-methods-first';
import { sdkCardFirstFlow } from './sdk-card-first';
import { mitFlow, serverCheckoutFlow, serverHostedFlow, serverRenderFormFlow } from './server-driven';
import { normalise, type Selection } from './selection';
import type { IntegrationFlow } from './types';

function base(sel: Selection): IntegrationFlow {
  const { api, experience, settings } = sel;
  if (api === 'payment') {
    if (experience === 'checkout')
      return settings.intentTiming === 'intent-first' ? sdkIntentFirstFlow : settings.intentTiming === 'card-first' ? sdkCardFirstFlow : sdkMethodsFirstFlow;
    if (experience === 'form') return sdkRenderFormFlow;
    if (experience === 'hosted') return settings.hosted === 'iframe' ? embedIframeFlow : embedRedirectFlow;
    return mitFlow('payment');
  }
  if (experience === 'checkout') return serverCheckoutFlow(api, settings);
  if (experience === 'form') return serverRenderFormFlow(api);
  if (experience === 'hosted') return serverHostedFlow(api, settings.hosted);
  return mitFlow(api);
}

/**
 * The flow for a selection. Its id names every setting that changes what runs, so
 * changing one asks for a fresh attempt.
 */
export function resolveFlow(selection: Selection): IntegrationFlow {
  const sel = normalise(selection);
  const flow = base(sel);
  const s = sel.settings;
  const key =
    sel.experience === 'checkout'
      ? sel.api === 'payment'
        ? `${s.intentTiming}-${s.threeDs}-${s.methodsLookup}`
        : `${s.cardEntry}-${s.wallets}-${s.threeDs}`
      : sel.experience === 'hosted'
        ? s.hosted
        : '';
  return { ...flow, id: `${sel.api}-${sel.experience}${key ? `-${key}` : ''}` };
}
