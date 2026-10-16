'use client';
// Step 2 of checkout: the payment itself, with the live console beside it. The
// checkout starts as soon as the page opens (the customer already pressed
// "Continue to payment"); every call between your store and MoneyHash appears in
// the console, and the next-step panel explains the latest response.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RESTART_EVENT, WithConsole } from '@/components/console/console-panel';
import { ThreeDsMode } from '@/flows/sdk/checkout/sdk-checkout';
import { EXPERIENCES, SETTING_LABELS, normalise, selectionLabel } from '@/flows/selection';
import { BACKEND_APIS } from '@/flows/types';
import { formatMoney } from '@/lib/catalog';
import { useConsole } from '@/store/console';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/cn';
import { EmptyBag } from './checkout-view';
import { NextStepPanel } from './next-step-panel';
import { TestCardsPanel } from './test-cards-panel';
import { useCheckoutSetup } from './use-checkout-setup';
import { accountKey } from '@/flows/session';

export function PayView() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="mx-auto h-96 max-w-7xl animate-pulse px-4" />;
  return <Pay />;
}

function Pay() {
  const { cfg, keys, lines, total, currency, flow, session, final } = useCheckoutSetup();
  const sel = normalise(cfg.selection);
  const apiLabel = BACKEND_APIS.find(a => a.id === sel.api)?.label ?? '';
  // Changing environment, version, secret switch, keys or customer restarts the checkout.
  const setupKey = `${flow.id}-${cfg.env}-${cfg.apiVersion}-${cfg.useIntentSecret}-${keys.apiKey.length}-${keys.publicApiKey.length}-${cfg.customerIds[accountKey(session)] ?? ''}`;
  // Seeded per page load, so a refresh starts a fresh attempt instead of reusing the last one.
  const [attempt, setAttempt] = useState(() => Date.now());
  const runKey = `${setupKey}-${attempt}`;
  // The checkout renders only once its console attempt exists, so its first call lands there.
  const ready = useConsole(c => c.attempts.find(a => a.id === c.currentAttemptId)?.runKey === runKey);

  // "Edit and resend" in the console: a fresh attempt with the edited intent.
  useEffect(() => {
    const restart = () => setAttempt(n => n + 1);
    window.addEventListener(RESTART_EVENT, restart);
    return () => window.removeEventListener(RESTART_EVENT, restart);
  }, []);

  // Open at the top, not where step 1 was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // One console attempt per run of the checkout.
  useEffect(() => {
    if (useConsole.getState().attempts.find(a => a.id === useConsole.getState().currentAttemptId)?.runKey === runKey) return;
    useConsole.getState().startAttempt(selectionLabel(sel, apiLabel), runKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  if (lines.length === 0) return <EmptyBag />;
  const FlowCheckout = flow.Checkout;
  const exp = EXPERIENCES.find(e => e.id === sel.experience)?.label;
  const s = sel.settings;
  const details =
    sel.experience === 'checkout'
      ? [
          sel.api === 'payment' ? SETTING_LABELS.intentTiming[s.intentTiming] : null,
          `Card: ${SETTING_LABELS.cardEntry[s.cardEntry]}`,
          `Wallets: ${SETTING_LABELS.wallets[s.wallets]}`,
          `3DS: ${SETTING_LABELS.threeDs[s.threeDs].toLowerCase()}`,
        ].filter(Boolean)
      : sel.experience === 'hosted'
        ? [SETTING_LABELS.hosted[s.hosted]]
        : [];

  return (
    <WithConsole>
      <div className="mx-auto max-w-lg space-y-8">
        <div>
          <Link href="/checkout" className="inline-flex items-center gap-1 text-sm text-subtle hover:text-bolder">
            <ArrowLeft className="size-4" /> Edit details and integration
          </Link>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-bolder">Payment</h1>
            <span className="text-base text-bolder">{formatMoney(total, currency)}</span>
          </div>
          <p className="mt-1 text-sm text-bolder">
            {apiLabel} · {exp}
          </p>
          {details.length > 0 && <p className="text-sm text-subtle">{details.join(' · ')}</p>}
        </div>

        <Steps steps={flow.steps(session)} />

        {FlowCheckout && ready && (
          <ThreeDsMode.Provider value={s.threeDs}>
            <FlowCheckout key={runKey} intentBody={final} session={session} />
          </ThreeDsMode.Provider>
        )}

        <NextStepPanel />

        <div className="border-t pt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => setAttempt(n => n + 1)}>
            Start a new attempt
          </Button>
        </div>
      </div>
      <TestCardsPanel currency={currency} />
    </WithConsole>
  );
}

/** The calls this integration makes, folded away by default. */
function Steps({ steps }: { steps: ReturnType<ReturnType<typeof useCheckoutSetup>['flow']['steps']> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-input">
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <span>
          <span className="block text-sm text-bolder">How this integration works</span>
          <span className="block text-xs text-subtle">{steps.length} steps, in the order the console will show them</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="space-y-2 px-4 pb-4">
          {steps.map((st, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-4 shrink-0 text-right tabular-nums text-subtler">{i + 1}</span>
              <span>
                <span className="text-subtle">{st.source}: </span>
                {st.label}
                {st.secret && <span className="block text-xs text-subtle">Intent secret: {st.secret}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
