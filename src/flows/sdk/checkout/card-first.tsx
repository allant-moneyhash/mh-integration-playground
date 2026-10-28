'use client';
// BIN lookup first: the card is known before the payment intent exists.
// - Card ("card-first checkout"): cardForm.collect() with no intent. The store checks a
//   bank coupon against the bank's list of eligible BINs using cardData.first_six_digits
//   (no MoneyHash call needed), optionally runs cardForm.binLookup / getInstallmentPlans,
//   then creates the intent for the final amount and pays it with the same cardData, so
//   the customer can't switch cards between the check and the payment.
// - Apple Pay / Google Pay (docs: receipt BIN lookup): the wallet sheet gives a receipt,
//   binLookupByReceipt({ nativeReceiptData, methodId }) reads the card behind it, then the
//   intent is created and the receipt submitted. The sheet already showed the amount, so
//   here the lookup informs routing and risk rather than the price.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type {
  BinLookUpData,
  CardData,
  InstallmentPlan,
  Method,
  NativeReceiptData,
} from '@moneyhash/js-sdk/headless';
import { Button } from '@/components/ui/button';
import { createPaymentIntent } from '@/lib/api-client';
import { formatMoney, type Currency } from '@/lib/catalog';
import type { IntentBody } from '@/lib/intent-body';
import { useConfig } from '@/store/config';
import { Input } from '@/components/ui/input';
import { newId, useConsole } from '@/store/console';
import { accountKey, type Session } from '../../session';
import {
  applyIntentSecret,
  createSdk,
  noteNextCall,
  type Sdk,
} from '../runtime';
import { CardForm, errorText } from './card-form';
import { ExpressCheckout } from './express';
import { checkoutIsDone, orderUrl, StateRenderer } from './sdk-checkout';

type Details = Awaited<ReturnType<Sdk['getIntentDetails']>>;
type Checked = {
  card: CardData;
  bin: BinLookUpData | null;
  plans: InstallmentPlan[];
  plansError: string | null;
  saveCard?: boolean;
  coupon: CouponResult;
};

/**
 * A bank coupon: valid only for cards whose BIN is on the list the bank gives the
 * merchant. Prefilled with the BIN of the 4242 test card so the demo works out of the box.
 */
type Coupon = { code: string; bins: string; percent: string };
const DEFAULT_COUPON: Coupon = {
  code: 'BANK10',
  bins: '424242',
  percent: '10',
};

/** The BINs the bank listed (6 or 8 digits); a card matches on its first six digits. */
const binList = (bins: string) =>
  bins
    .split(/[\s,;]+/)
    .map(b => b.replace(/\D/g, ''))
    .filter(b => b.length >= 6);

type CouponResult = {
  applied: boolean;
  percent: number;
  reason: string;
} | null;

export function CardFirstCheckout({
  intentBody,
  session,
}: {
  intentBody: IntentBody;
  session: Session;
}) {
  const router = useRouter();
  const cardLayout = useConfig(s => s.cardFormLayout);
  const customerId = useConfig(s => s.customerIds[accountKey(session)] ?? '');
  const [sdk, setSdk] = useState<Sdk | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [coupon, setCoupon] = useState<Coupon>(DEFAULT_COUPON);
  /** Optional MoneyHash calls: BIN lookup is a service enabled per account. */
  const [useBinLookup, setUseBinLookup] = useState(false);
  const [usePlans, setUsePlans] = useState(false);
  const [planId, setPlanId] = useState<string>('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  /** Wallet buttons need nativePayData, which only getMethods returns. */
  const [wallets, setWallets] = useState<Method[]>([]);
  const [walletLookup, setWalletLookup] = useState<{
    method: string;
    bin: BinLookUpData | null;
  } | null>(null);
  const flowId =
    typeof intentBody.flow_id === 'string' ? intentBody.flow_id : undefined;

  const currency = String(intentBody.amount_currency) as Currency;
  const base = Number(intentBody.amount);
  const result = checked?.coupon ?? null;
  const discount = result?.applied
    ? Math.round(base * result.percent) / 100
    : 0;
  const total = Math.round((base - discount) * 100) / 100;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const s = await createSdk(session);
        setSdk(s);
        noteNextCall(
          'getMethods',
          'Wallet setup: lists the Apple Pay / Google Pay buttons (nativePayData), so a wallet receipt can be looked up too.',
        );
        const m = await s
          .getMethods({
            currency: String(intentBody.amount_currency),
            amount: Number(intentBody.amount),
            ...(customerId ? { customer: customerId } : {}),
            ...(flowId ? { flowId } : { operation: 'purchase' as const }),
          })
          .catch(() => null);
        setWallets(m?.expressMethods ?? []);
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [session, intentBody, customerId, flowId]);

  /** The intent body both paths share; the card path sets the final amount and CARD. */
  function bodyFor(amount: number, method?: string): IntentBody {
    const body: IntentBody = {
      ...intentBody,
      amount,
      form_only: true,
      hide_loader_message: true,
    };
    if (method) body.payment_method = method;
    body.threeds = { enabled: true, ...(body.threeds as object) };
    if (!body.flow_id) body.operation = body.operation ?? 'purchase';
    // The basket lines no longer add up to a discounted amount.
    if (amount !== base) delete body.product_items;
    if (customerId) {
      body.customer = customerId;
      if (method === 'CARD') body.allow_tokenize_card = true;
    }
    return body;
  }

  /** Wallet: look up the card behind the receipt, then create the intent and submit the receipt. */
  async function onReceipt(methodId: string, receipt: NativeReceiptData) {
    if (!sdk) throw new Error('SDK not ready');
    setError(null);
    try {
      const bin = await sdk
        .binLookupByReceipt({
          nativeReceiptData: receipt,
          methodId,
          ...(flowId ? { flowId } : {}),
        })
        .catch(() => null);
      setWalletLookup({ method: methodId, bin });
      const res = await createPaymentIntent(session, bodyFor(base));
      applyIntentSecret(sdk, session, res.data.intent_secret);
      setIntentId(res.data.id);
      await sdk.proceedWith({
        intentId: res.data.id,
        type: 'method',
        id: methodId,
      });
      setDetails(
        await sdk.submitPaymentReceipt({
          intentId: res.data.id,
          nativeReceiptData: receipt,
        }),
      );
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  }

  useEffect(() => {
    if (details && intentId && checkoutIsDone(details))
      router.replace(orderUrl(intentId));
  }, [details, intentId, router]);

  /** The store's own coupon rule, logged so the audience sees it runs on your side. */
  function checkCoupon(card: CardData): CouponResult {
    const code = coupon.code.trim();
    if (!code) return null;
    const bins = binList(coupon.bins);
    const first6 = card.first_six_digits;
    const percent = Math.min(Math.max(Number(coupon.percent) || 0, 0), 100);
    const match = bins.find(b => b.slice(0, 6) === first6);
    const out: CouponResult = match
      ? {
          applied: true,
          percent,
          reason: `BIN ${first6} is on the bank's list for ${code}.`,
        }
      : {
          applied: false,
          percent,
          reason: `BIN ${first6} is not on the bank's list for ${code}, so the full amount applies.`,
        };
    useConsole.getState().add({
      id: newId(),
      ts: Date.now(),
      source: 'Playground',
      title: `Your store: coupon ${code} checked against the bank's BINs`,
      request: {
        body: { coupon: code, first_six_digits: first6, eligible_bins: bins },
      },
      response: {
        applied: out.applied,
        discount_percent: out.applied ? percent : 0,
      },
      ok: true,
      note: `${out.reason} Your server's own rule using cardData.first_six_digits from cardForm.collect(); no MoneyHash call. The same collected card is paid next, so the customer can't swap cards after the check.`,
    });
    return out;
  }

  /** Step 1: collect the card (no intent yet), apply the coupon, and optionally look it up. */
  async function checkCard({ saveCard }: { saveCard?: boolean }) {
    if (!sdk) return;
    setError(null);
    const card = await sdk.cardForm.collect();
    const couponResult = checkCoupon(card);
    const bin = useBinLookup
      ? await sdk.cardForm.binLookup({ cardData: card }).catch(() => null)
      : null;
    let plansError: string | null = null;
    const plans = usePlans
      ? await sdk
          .getInstallmentPlans({
            first6Digits: card.first_six_digits,
            amount: String(base),
            currency,
          })
          .catch(e => {
            const t = errorText(e);
            plansError = /EMI is not supported/i.test(t)
              ? 'Installments (EMI) are not set up for card on this account.'
              : t;
            return [] as InstallmentPlan[];
          })
      : [];
    setPlanId('');
    setChecked({
      card,
      bin,
      plans,
      plansError,
      saveCard,
      coupon: couponResult,
    });
  }

  /** Step 2: the server creates the intent for the final amount; the collected card pays it. */
  async function pay() {
    if (!sdk || !checked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createPaymentIntent(session, bodyFor(total, 'CARD'));
      applyIntentSecret(sdk, session, res.data.intent_secret);
      setIntentId(res.data.id);
      const plan = checked.plans.find(p => p.id === planId);
      if (plan)
        noteNextCall(
          'cardForm.pay',
          'Paid with the card collected before the intent, with the installment plan the customer picked.',
        );
      const d = await sdk.cardForm.pay({
        intentId: res.data.id,
        cardData: checked.card,
        ...(customerId ? { saveCard: checked.saveCard } : {}),
        ...(plan
          ? {
              installmentPlanData: {
                planId: plan.id,
                ...(plan.issuerCode ? { issuerCode: plan.issuerCode } : {}),
              },
            }
          : {}),
      });
      setDetails(d);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!sdk) {
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> Loading the card form…
      </p>
    );
  }

  if (details && intentId) {
    return (
      <div className="space-y-4">
        {walletLookup && (
          <LookupTable
            title={`${walletLookup.method.replace('_', ' ')} card (from the receipt)`}
            bin={walletLookup.bin}
          />
        )}
        <div className="rounded-md border border-input">
          <StateRenderer
            sdk={sdk}
            intentId={intentId}
            details={details}
            method="CARD"
            layout={cardLayout}
            payLabel={`Pay ${formatMoney(total, currency)}`}
            onDetails={setDetails}
          />
        </div>
      </div>
    );
  }

  const bin = checked?.bin;
  return (
    <div className="space-y-6">
      {!checked && (
        <div>
          <ExpressCheckout
            methods={wallets}
            sdk={sdk}
            live={session.env === 'production'}
            onReceipt={onReceipt}
          />
          {wallets.some(w => w.nativePayData) && (
            <p className="mt-1 text-xs text-subtler">
              Wallets: binLookupByReceipt reads the card behind the receipt
              before the payment is submitted. Coupons apply to typed cards
              only: the wallet sheet authorises the full amount before the store
              sees the card.
            </p>
          )}
        </div>
      )}
      {walletLookup && (
        <LookupTable
          title={`${walletLookup.method.replace('_', ' ')} card (from the receipt)`}
          bin={walletLookup.bin}
        />
      )}
      <div>
        <h3 className="font-medium text-bolder">Card</h3>
        <p className="text-sm text-subtler">
          No intent yet: the card is collected first so the store can price the
          order.
        </p>
        {!checked && (
          <CouponPanel
            coupon={coupon}
            onChange={setCoupon}
            useBinLookup={useBinLookup}
            onBinLookup={setUseBinLookup}
            usePlans={usePlans}
            onPlans={setUsePlans}
          />
        )}
        {/* Kept mounted after the check so "Change card" keeps what was typed. */}
        <div
          className={checked ? 'hidden' : 'mt-2 rounded-md border border-input'}
        >
          <CardForm
            sdk={sdk}
            layout={cardLayout}
            payLabel="Check card"
            onPay={checkCard}
            offerSaveCard={!!customerId}
          />
        </div>
      </div>

      {checked && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-input p-4 text-sm">
            <span className="text-bolder">
              {bin?.brand ?? checked.card.card_scheme} ••••{' '}
              {checked.card.last_four_digits}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setChecked(null)}
            >
              Change card
            </Button>
          </div>

          <div className="rounded-md border border-input p-4 text-sm">
            <p className="text-bolder">
              {result
                ? result.applied
                  ? `Coupon ${coupon.code.trim()}: ${result.percent}% off`
                  : `Coupon ${coupon.code.trim()}: not valid for this card`
                : 'No coupon entered'}
            </p>
            <p className="text-subtle">
              {result?.reason ??
                'Enter a coupon before checking the card to apply a bank discount.'}
            </p>
          </div>

          {useBinLookup && (
            <LookupTable title="MoneyHash BIN lookup" bin={bin ?? null} />
          )}

          {usePlans && (
            <div>
              <h3 className="font-medium text-bolder">Installments</h3>
              <div className="mt-2 divide-y divide-input rounded-md border border-input">
                {checked.plans.length === 0 && (
                  <p className="p-4 text-sm text-subtle">
                    {checked.plansError ??
                      'No installment plans for this card and amount (getInstallmentPlans returned none).'}
                  </p>
                )}
                {checked.plans.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                    <input
                      type="radio"
                      name="mh-plan"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={planId === ''}
                      onChange={() => setPlanId('')}
                    />
                    <span className="text-bolder">Pay in full</span>
                  </label>
                )}
                {checked.plans.map(p => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="mh-plan"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={planId === p.id}
                      onChange={() => setPlanId(p.id)}
                    />
                    <span className="flex-1 text-bolder">
                      {p.installmentPeriod} months × {p.amount.formatted}{' '}
                      {p.amount.currency}
                      {p.issuerNameEn && (
                        <span className="text-subtle"> · {p.issuerNameEn}</span>
                      )}
                    </span>
                    <span className="text-xs text-subtle">
                      {p.interestRate
                        ? `${p.interestRate}% interest`
                        : 'No interest'}
                    </span>
                  </label>
                ))}
              </div>
              {checked.plans.length > 0 && discount > 0 && (
                <p className="mt-1 text-xs text-subtler">
                  Plans were listed for the full amount, before the coupon.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1 rounded-md border border-input p-4 text-sm">
            <div className="flex justify-between text-subtle">
              <span>Order</span>
              <span>{formatMoney(base, currency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-subtle">
                <span>Coupon {coupon.code.trim()}</span>
                <span>−{formatMoney(discount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-bolder">
              <span>Total</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          </div>

          <Button className="w-full" disabled={busy} onClick={pay}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Pay {formatMoney(total, currency)}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** What a BIN lookup returned, as the store would use it. */
function LookupTable({
  title,
  bin,
}: {
  title: string;
  bin: BinLookUpData | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-input p-4 text-sm">
      <dt className="col-span-2 font-medium capitalize text-bolder">
        {title.toLowerCase()}
      </dt>
      {bin ? (
        <>
          <dt className="text-subtle">Brand</dt>
          <dd className="text-bolder">{bin.brand}</dd>
          <dt className="text-subtle">Type</dt>
          <dd className="text-bolder">{bin.cardType ?? 'Unknown'}</dd>
          <dt className="text-subtle">Issuer</dt>
          <dd className="text-bolder">{bin.issuer ?? 'Unknown'}</dd>
          <dt className="text-subtle">Issuer country</dt>
          <dd className="text-bolder">{bin.issuerCountry ?? 'Unknown'}</dd>
        </>
      ) : (
        <dd className="col-span-2 text-xs text-subtler">
          The lookup returned nothing for this card (see the console).
        </dd>
      )}
    </dl>
  );
}

/** The store's coupon setup, edited before the card is checked. */
function CouponPanel({
  coupon,
  onChange,
  useBinLookup,
  onBinLookup,
  usePlans,
  onPlans,
}: {
  coupon: Coupon;
  onChange: (c: Coupon) => void;
  useBinLookup: boolean;
  onBinLookup: (v: boolean) => void;
  usePlans: boolean;
  onPlans: (v: boolean) => void;
}) {
  const set = (patch: Partial<Coupon>) => onChange({ ...coupon, ...patch });
  return (
    <div className="mt-2 space-y-3 rounded-md border border-input p-4">
      <p className="text-sm text-bolder">Bank coupon</p>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Coupon code"
          value={coupon.code}
          onChange={e => set({ code: e.target.value })}
        />
        <Input
          label="Discount %"
          inputMode="decimal"
          value={coupon.percent}
          onChange={e => set({ percent: e.target.value })}
        />
      </div>
      <Input
        label="Eligible BINs from the bank (comma separated)"
        value={coupon.bins}
        onChange={e => set({ bins: e.target.value })}
      />
      <p className="text-xs text-subtle">
        Your store checks the card’s first six digits against this list after
        cardForm.collect(). 424242 matches the 4242 test card; any other card
        pays the full amount.
      </p>
      <div className="space-y-1 text-sm text-subtle">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={useBinLookup}
            onChange={e => onBinLookup(e.target.checked)}
          />
          Also run MoneyHash BIN lookup (issuer, type, country; the service must
          be enabled on the account)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={usePlans}
            onChange={e => onPlans(e.target.checked)}
          />
          Also list installment plans for the card
        </label>
      </div>
    </div>
  );
}
