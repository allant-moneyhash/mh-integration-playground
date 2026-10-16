'use client';
// "What do I do with this response?" The latest intent state from this checkout,
// shown as a pair: what MoneyHash returned (SDK or your server) and what the
// customer sees, with one line on what to code for it.
import { useState } from 'react';
import type { ConsoleEntry } from '@/lib/console-types';
import { ChevronDown } from 'lucide-react';
import { useConsole } from '@/store/console';
import { nextState } from '@/lib/console-explain';
import { cn } from '@/lib/cn';
import { JsonView } from '@/components/console/json-view';

const GUIDE: Record<string, { sees: string; code: string }> = {
  METHOD_SELECTION: { sees: 'The list of payment methods, wallets and saved cards.', code: 'Render your method list from the methods returned; on pick, select the method (proceedWith or update-method).' },
  FORM_FIELDS: { sees: 'The card form (and any billing fields MoneyHash asks for).', code: 'Render state_details: card fields via the SDK / your own form (Direct), billing fields as inputs, then pay or submit the form.' },
  URL_TO_RENDER: { sees: 'The provider’s page, e.g. 3DS, in the page or after a redirect.', code: 'Render state_details.url / embed_url with the given render strategy (iframe, popup or redirect); the result comes back by webhook and redirect.' },
  SAVED_CARD_CVV: { sees: 'A CVV field for the saved card.', code: 'Collect the CVV and submit it (submitCvv, or card_token with cvv on External/Direct).' },
  OTP_FORM: { sees: 'A one-time code field.', code: 'Collect the code and call submitOtp with state_details.intentOtpData.' },
  INSTALLMENT_PLANS: { sees: 'A list of instalment plans.', code: 'Render state_details.plans and call selectInstallmentPlan with the chosen plan (and issuerCode).' },
  INTENT_FORM: { sees: 'MoneyHash’s own form for this step.', code: 'Call renderForm on a container; it resolves when the step completes.' },
  NATIVE_PAY: { sees: 'The wallet sheet.', code: 'Open the wallet sheet with nativePayData and submit the receipt (submitPaymentReceipt or …/receipt/).' },
  PROCESSING: { sees: 'A “processing” message.', code: 'Wait: poll getIntentDetails or wait for the webhook; don’t ask the customer to retry yet.' },
  TRANSACTION_WAITING_USER_ACTION: { sees: 'The order page with the provider’s instructions (e.g. pay on delivery).', code: 'Show the order as placed with payment pending; fulfil when the success webhook arrives.' },
  INTENT_PROCESSED: { sees: 'The success page.', code: 'Fulfil the order on the webhook, not on this response alone.' },
  TRANSACTION_FAILED: { sees: 'The failure message with a retry option.', code: 'Let the customer retry on the same intent (pick another method or card).' },
  EXPIRED: { sees: 'An “expired” message.', code: 'Create a new intent to retry.' },
  CLOSED: { sees: 'A “closed” message.', code: 'Create a new intent to retry.' },
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);

export function NextStepPanel() {
  // Select stable store values; derive the latest state from them.
  const entries = useConsole(s => s.entries);
  const attemptId = useConsole(s => s.currentAttemptId);
  const latest = latestState(entries, attemptId);
  const [open, setOpen] = useState(false);
  if (!latest) return null;

  const r = obj(latest.entry.response);
  const details = r?.stateDetails ?? r?.state_details ?? obj(r?.data)?.state_details ?? null;
  const guide = GUIDE[latest.state];
  const from = latest.entry.source === 'Frontend SDK' ? `moneyHash.${latest.entry.title}()` : latest.entry.title;

  return (
    <div className="rounded-md border border-input text-sm">
      <div className="flex flex-wrap items-baseline gap-2 px-4 pt-4">
        <span className="text-sm text-bolder">Next step</span>
        <span className="font-mono text-xs text-bolder">{latest.state}</span>
        <span className="text-[11px] text-subtle">from {from}</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-subtle">Customer sees</p>
          <p className="mt-0.5 text-xs text-foreground">{guide?.sees ?? latest.meaning ?? 'See the response.'}</p>
        </div>
        <div>
          <p className="text-xs text-subtle">You code</p>
          <p className="mt-0.5 text-xs text-foreground">{guide?.code ?? 'Handle this state as the docs describe.'}</p>
        </div>
      </div>
      {details !== null && details !== undefined && (
        <div className="border-t border-input px-4 py-3">
          <button className="flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={() => setOpen(o => !o)}>
            <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
            {open ? 'Hide' : 'Show'} the state details MoneyHash returned
          </button>
          {open && (
            <div className="mt-2 max-h-72 overflow-auto rounded bg-accent p-2 text-xs [overflow-wrap:anywhere]">
              <JsonView value={details} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The newest call in this checkout whose response says what the intent needs next. */
function latestState(entries: ConsoleEntry[], attemptId: string | null) {
  if (!attemptId) return null;
  const list = entries.filter(e => e.attemptId === attemptId);
  for (let i = list.length - 1; i >= 0; i--) {
    const n = nextState(list[i]);
    if (n) return { entry: list[i], ...n };
  }
  return null;
}
