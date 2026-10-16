'use client';
// Where MoneyHash's redirect URLs land. The outcome comes from the playground
// backend's order record, which only webhooks update, as on a real merchant
// site. If no final webhook arrives within FALLBACK_AFTER_MS, the page falls
// back to GET intent (reconciliation). The redirect's query string is ignored.
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WithConsole } from '@/components/console/console-panel';
import { formatMoney } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { useOrders } from '@/store/orders';
import { WebhookWatcher } from '@/components/webhook-watcher';
import { getPaymentIntent } from '@/lib/api-client';
import { summariseIntent, type IntentSummary } from '@/lib/intent-outcome';
import { resolveSession } from '@/flows/session';
import { useConfig } from '@/store/config';
import { useKeys } from '@/store/keys';
import { useCart } from '@/store/cart';
import { useConsole } from '@/store/console';
import { useHydrated } from '@/lib/use-hydrated';
import type { ConsoleEntry } from '@/lib/console-types';

const FALLBACK_AFTER_MS = 20_000;
const FALLBACK_EVERY_MS = 5_000;

export function OrderView() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const intentId = params.get('intent_id');

  // The iframe flow can land here inside the iframe: move the whole window instead.
  useEffect(() => {
    if (window.top && window.top !== window.self) {
      try {
        window.top.location.href = window.location.href;
      } catch {
        // Different origin: nothing we can do from inside the frame.
      }
    }
  }, []);

  if (!hydrated)
    return <div className="mx-auto h-96 max-w-7xl animate-pulse px-4" />;
  if (window.top !== window.self)
    return <p className="p-6 text-sm text-subtle">Returning to the store…</p>;
  return <Order intentId={intentId} />;
}

type Decided = { summary: IntentSummary; via: string };

function Order({ intentId }: { intentId: string | null }) {
  const clearCart = useCart(s => s.clear);
  const order = useConsole(s => (intentId ? s.orders[intentId] : undefined));
  const [fallback, setFallback] = useState<IntentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noPayment, setNoPayment] = useState(false);

  // "pending" waits; "action" (order placed, payment outside the store) is shown at once.
  const decided: Decided | null =
    order && order.outcome !== 'pending'
      ? { summary: order.summary, via: `the ${order.event} webhook` }
      : fallback && fallback.outcome !== 'pending'
        ? {
            summary: fallback,
            via: 'GET /payments/intent/{id}/ (no final webhook yet)',
          }
        : null;

  const isDecided = decided !== null;

  // The console shows the checkout that led to this order.
  useEffect(() => {
    if (!intentId) return;
    const s = useConsole.getState();
    const attempt = s.attemptForIntent(intentId);
    if (attempt) s.focusAttempt(attempt);
    else s.endAttempt();
  }, [intentId]);

  // Reconciliation fallback, only if webhooks are late or missing.
  useEffect(() => {
    if (!intentId || isDecided || noPayment) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const session = resolveSession(useConfig.getState(), useKeys.getState());

    async function check() {
      if (stopped) return;
      let entries: ConsoleEntry[] = [];
      try {
        const res = await getPaymentIntent(session, intentId!, {
          log: false,
          onEntries: e => (entries = e),
        });
        if (stopped) return;
        const s = summariseIntent(res.data);
        if (s.outcome !== 'pending') {
          useConsole.getState().add(
            ...entries.map(e => ({
              ...e,
              title: 'Fallback: get payment intent (no final webhook yet)',
            })),
          );
          setFallback(s);
          return;
        }
        // No transaction at all: the customer left before paying, so no webhook will come.
        if (!s.transactionId) {
          useConsole.getState().add(
            ...entries.map(e => ({
              ...e,
              title: 'Fallback: get payment intent (no payment attempted)',
            })),
          );
          setNoPayment(true);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the intent.');
      }
      timer = setTimeout(check, FALLBACK_EVERY_MS);
    }

    timer = setTimeout(check, FALLBACK_AFTER_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [intentId, isDecided, noPayment]);

  // Paid, or placed with payment pending (Cash on Delivery…): the cart is done.
  useEffect(() => {
    if (
      decided?.summary.outcome === 'success' ||
      decided?.summary.outcome === 'action'
    )
      clearCart();
  }, [decided?.summary.outcome, clearCart]);

  return (
    <WithConsole narrow>
      <WebhookWatcher intentId={intentId} />
      <div className="py-8 sm:py-12">
        {!intentId && (
          <p className="text-subtle">
            No intent_id in the URL, so there is nothing to look up.
          </p>
        )}
        {intentId && !decided && (noPayment ? <NoPayment /> : <Waiting />)}
        {error && !decided && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}
        {decided && <Result decided={decided} intentId={intentId!} />}
      </div>
    </WithConsole>
  );
}

function Waiting() {
  return (
    <div className="max-w-xl">
      <h1 className="flex items-center gap-2 text-base font-medium text-primary">
        <Loader2 className="size-4 animate-spin" /> Confirming your payment
      </h1>
      <p className="mt-2 text-4xl font-bold tracking-tight text-bolder sm:text-5xl">
        One moment…
      </p>
      <p className="mt-2 text-base text-subtle">
        Waiting for MoneyHash&apos;s webhook to reach the store. This page
        updates by itself.
      </p>
    </div>
  );
}

function NoPayment() {
  return (
    <div className="max-w-xl">
      <h1 className="text-base font-medium text-destructive">
        No payment was made
      </h1>
      <p className="mt-2 text-4xl font-bold tracking-tight text-bolder sm:text-5xl">
        Your order isn&apos;t placed yet
      </p>
      <p className="mt-2 text-base text-subtle">
        MoneyHash has no transaction for this intent, so the checkout was left
        before paying. Your cart is still there.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild>
          <Link href="/checkout">Back to checkout</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CAPTURED: 'Paid',
  AUTHORIZED: 'Authorized',
  AUTHORIZE_ATTEMPT_FAILED: 'Declined',
  AUTHORIZE_ATTEMPT_PENDING: 'Pending',
  PENDING: 'Payment pending',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
  ABORTED: 'Aborted',
};

const titleCase = (s: string) =>
  s.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** The highlighted payment details: what the webhook told the store. */
function PaymentSummary({
  summary,
  intentId,
  via,
  total,
}: {
  summary: IntentSummary;
  intentId: string;
  via: string;
  total?: string;
}) {
  const ok = summary.outcome === 'success';
  const pending = summary.outcome === 'action';
  const badge = pending
    ? 'Payment pending'
    : (PAYMENT_STATUS_LABEL[summary.paymentStatus ?? ''] ??
      (ok ? 'Paid' : 'Failed'));
  const method = [
    summary.paymentMethod && titleCase(summary.paymentMethod.toLowerCase()),
    summary.card,
  ]
    .filter(Boolean)
    .join(' · ');
  const rows: [string, React.ReactNode][] = [
    ['Amount', summary.amount ?? total ?? '–'],
    ['Payment method', method || '–'],
    ...(summary.provider
      ? [['Processed by', summary.provider] as [string, React.ReactNode]]
      : []),
    ['Transaction ID', <Copyable key="tx" value={summary.transactionId} />],
    ['Intent ID', <Copyable key="intent" value={intentId} />],
    [
      'MoneyHash status',
      (pending ? summary.transactionStatus : undefined) ??
        summary.paymentStatus ??
        summary.transactionStatus ??
        summary.intentStatus ??
        '–',
    ],
  ];
  return (
    <section
      className={cn(
        'mt-10 overflow-hidden rounded-lg border',
        ok
          ? 'border-green-600/30 bg-green-500/5'
          : pending
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="flex items-center justify-between border-b border-inherit px-5 py-3">
        <h2 className="text-sm font-medium text-bolder">Payment details</h2>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            ok
              ? 'bg-green-600 text-white'
              : pending
                ? 'bg-amber-500 text-white'
                : 'bg-destructive text-white',
          )}
        >
          {badge}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-subtle">{k}</dt>
            <dd className="mt-1 font-medium break-all text-bolder">{v}</dd>
          </div>
        ))}
      </dl>
      {pending && !!summary.actionMessages?.length && (
        <div className="border-t border-inherit px-5 py-4 text-sm">
          <h3 className="font-medium text-bolder">
            How to complete the payment
          </h3>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-subtle">
            {summary.actionMessages.map((m, i) => (
              <li key={i} className="text-bolder">
                <Linkified text={m} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-subtle">
            Use this reference to pay with {summary.provider ?? 'the provider'}{' '}
            (for Sadad: in your bank&apos;s app or online banking, under Sadad
            bill payments). The order updates once the provider confirms the
            payment.
          </p>
        </div>
      )}
      <p className="border-t border-inherit px-5 py-2 text-xs text-subtle">
        {pending ? 'Order placed per' : 'Confirmed by'} {via}.
        {pending && ' This page updates when the payment is completed.'}
      </p>
    </section>
  );
}

/** Provider instructions may include links (e.g. a payment page or a bank-details PDF). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline"
          >
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Copyable({ value }: { value?: string }) {
  if (!value) return <>–</>;
  return (
    <button
      className="inline-flex items-center gap-1.5 text-left font-mono text-xs text-primary hover:underline dark:text-subtler"
      onClick={() => navigator.clipboard.writeText(value)}
      title="Copy"
    >
      {value}
      <Copy className="size-3 shrink-0" />
    </button>
  );
}

// Same layout as shop.moneyhash.io's order page.
function Result({ decided, intentId }: { decided: Decided; intentId: string }) {
  const { summary, via } = decided;
  const order = useOrders(s => s.snapshots[intentId]);
  const ok = summary.outcome === 'success';
  const pending = summary.outcome === 'action';
  const c = order?.customer;

  return (
    <div>
      <div className="max-w-xl">
        <h1
          className={cn(
            'flex items-center gap-2 text-base font-medium',
            ok || pending ? 'text-primary' : 'text-destructive',
          )}
        >
          {ok
            ? 'Thank you!'
            : pending
              ? 'Order placed · payment pending'
              : 'Payment failed'}
          {summary.isLive && (
            <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white">
              LIVE
            </span>
          )}
        </h1>
        <p className="mt-2 text-4xl font-bold tracking-tight text-bolder sm:text-5xl">
          {ok
            ? "It's on the way!"
            : pending
              ? 'Almost there!'
              : 'We couldn’t take your payment'}
        </p>
        <p className="mt-2 text-base text-subtle">
          {ok
            ? 'Your payment is confirmed and your order will ship soon.'
            : pending
              ? 'Your order is placed. Complete the payment as described below; we’ll confirm it once the provider tells us.'
              : (summary.responseMessage ??
                'Please try again or choose another payment method.')}
        </p>
      </div>

      <PaymentSummary
        summary={summary}
        intentId={intentId}
        via={via}
        total={order ? formatMoney(order.total, order.currency) : undefined}
      />

      <div className="mt-10 border-t">
        {order?.items.map(item => (
          <div key={item.id} className="flex gap-6 border-b py-8">
            <Image
              src={item.imageSrc}
              alt={item.imageAlt}
              width={160}
              height={160}
              className="h-20 w-20 flex-none rounded-lg object-cover sm:h-32 sm:w-32"
            />
            <div className="flex flex-auto flex-col">
              <h4 className="font-medium">{item.name}</h4>
              <p className="mt-1 text-sm text-subtle">{item.color}</p>
              <dl className="mt-auto flex divide-x pt-4 text-sm">
                <div className="flex pe-4">
                  <dt className="font-medium text-subtler">Quantity</dt>
                  <dd className="ms-2 text-bolder">{item.quantity}</dd>
                </div>
                <div className="flex ps-4">
                  <dt className="font-medium text-subtler">Price</dt>
                  <dd className="ms-2 text-bolder">
                    {formatMoney(item.lineTotal, order.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ))}

        <div className="sm:ms-32 sm:ps-6">
          {c && (
            <dl className="grid grid-cols-1 gap-6 py-8 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-subtle">Shipping address</dt>
                <dd className="mt-2">
                  <span className="block">{c.address}</span>
                  <span className="block">
                    {c.city}, {c.country}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-subtle">Contact information</dt>
                <dd className="mt-2">
                  <span className="block">
                    {c.first_name} {c.last_name}
                  </span>
                  <span className="block">{c.email}</span>
                  <span className="block">{c.phone_number}</span>
                </dd>
              </div>
            </dl>
          )}
          {order && (
            <dl className="flex justify-between border-t pt-8 text-sm">
              <dt className="font-medium text-bolder">Total</dt>
              <dd className="font-medium">
                {formatMoney(order.total, order.currency)}
              </dd>
            </dl>
          )}
          <div className="mt-10 flex gap-2">
            <Button asChild>
              <Link href="/">Continue shopping</Link>
            </Button>
            {!ok && !pending && (
              <Button asChild variant="outline">
                <Link href="/checkout">Try again</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
