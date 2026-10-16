'use client';
// Headless JS SDK checkout, ported from shop.moneyhash.io
// (pages/checkout.tsx, components/checkout/paymentForm.tsx and
// intentStateRenderer/*). Same call order as the shop:
//   methods first:  getMethods → pick → backend creates intent(payment_method, form_only)
//                   → setIntentSecret → getIntentDetails → render state
//   intent first:   backend creates intent(form_only) → setIntentSecret → getMethods({intentId})
//                   → pick → proceedWith → render state
//   wallets:        wallet sheet → receipt → intent (if none) → proceedWith → submitPaymentReceipt
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Card, Field, InstallmentPlan, Method, NativeReceiptData } from '@moneyhash/js-sdk/headless';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPaymentIntent } from '@/lib/api-client';
import { formatMoney, type Currency } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { useConfig } from '@/store/config';
import type { IntentBody } from '@/lib/intent-body';
import { accountKey, type Session } from '../../session';
import { lookupSends } from '../../selection';
import { applyIntentSecret, createSdk, noteNextCall, sdkEditsFor, type Sdk } from '../runtime';
import { BillingFields, CardForm, errorText, fieldsComplete, prefillFields } from './card-form';
import { ExpressCheckout } from './express';
import { SavedCards } from './saved-cards';

type Details = Awaited<ReturnType<Sdk['getIntentDetails']>>;

/** Same rule as the shop's createIntent: BNPL providers authorize, everything else purchases. */
const AUTHORIZE_METHODS = ['TABBY', 'TAMARA'];
const EXPRESS_IDS = ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY'];
/**
 * Wallets are paid with their own button (express checkout: sheet → receipt →
 * submitPaymentReceipt). As a plain list choice, proceedWith would only switch the
 * intent to MoneyHash's hosted form (INTENT_FORM) and no payment would be made.
 */
const withoutWallets = (list: Method[]) => list.filter(m => !EXPRESS_IDS.includes(m.id));
/** Internal marker for "paying with a saved card" (not a MoneyHash method id). */
const SAVED = '__SAVED_CARD__';

export const orderUrl = (intentId: string) => `/checkout/order?intent_id=${encodeURIComponent(intentId)}`;

/**
 * Nothing left for the customer to do on the checkout page. A failed attempt
 * (TRANSACTION_FAILED, payment status AUTHORIZE_ATTEMPT_FAILED) is not in here: the
 * intent stays open, so the page offers MoneyHash's recommended methods and a retry.
 * Otherwise:
 * paid / authorised / declined (shop rule), finished or failed states, and
 * TRANSACTION_WAITING_USER_ACTION — the order is placed and payment happens
 * outside the store (Cash on Delivery, Bank Transfer…); the order page shows the
 * provider's instructions and the final result arrives by webhook.
 */
export function checkoutIsDone(details: { state?: unknown; paymentStatus?: unknown }) {
  const ps = (details.paymentStatus as { status?: string } | undefined)?.status ?? '';
  const st = String(details.state ?? '');
  return (
    ['CAPTURED', 'AUTHORIZED'].includes(ps) || ['INTENT_PROCESSED', 'TRANSACTION_WAITING_USER_ACTION', 'CLOSED', 'EXPIRED'].includes(st)
  );
}

export function SdkCheckout({ mode, intentBody: given, session }: { mode: 'methods-first' | 'intent-first'; intentBody: IntentBody; session: Session }) {
  const router = useRouter();
  const cardLayout = useConfig(s => s.cardFormLayout);
  // "getMethods for": which of the Flow ID and customer this scenario sends (to getMethods and the intent).
  const lookup = useConfig(s => s.selection.settings.methodsLookup);
  const sends = lookupSends(lookup);
  // A customer (from the Customer section) brings saved cards and "save this card".
  const storedCustomer = useConfig(s => s.customerIds[accountKey(session)] ?? '');
  const customerId = sends.customer ? storedCustomer : '';
  const [intentBody] = useState<IntentBody>(() => {
    if (sends.flow && sends.customer) return given;
    const b = { ...given };
    if (!sends.flow) delete b.flow_id;
    if (!sends.customer) delete b.customer;
    return b;
  });
  // Guest first, then sign-in (methods first): a guest getMethods first, then the same call with the customer.
  const guestFirst = lookup === 'generic-then-customer' && mode === 'methods-first';
  const [signedIn, setSignedIn] = useState(false);
  const [sdk, setSdk] = useState<Sdk | null>(null);
  const [methods, setMethods] = useState<{ payment: Method[]; express: Method[]; saved: Card[] } | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  /** deleteCard needs the intent secret, so cards can be removed once an intent exists. */
  const [intentSecret, setIntentSecret] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** The saved card picked (one choice at a time: picking a method clears it). */
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const amountLabel = formatMoney(Number(intentBody.amount), String(intentBody.amount_currency) as Currency);

  /** The backend creates the intent; headless needs form_only so MoneyHash returns form fields, not its hosted page. */
  const createIntent = useCallback(
    async (s: Sdk, methodId?: string) => {
      const body: IntentBody = { ...intentBody, form_only: true, hide_loader_message: true };
      if (methodId && !EXPRESS_IDS.includes(methodId) && methodId !== SAVED) body.payment_method = methodId;
      // Shop rule: with a customer, card payments may be saved (the card form offers it).
      if (customerId) {
        body.customer = customerId;
        if (!methodId || methodId === 'CARD' || methodId === SAVED) body.allow_tokenize_card = true;
      }
      // Ask for 3DS whenever a card can be used: CARD now, or any method chosen later
      // (intent first creates the intent before the customer picks), and wallets
      // (Google Pay PAN_ONLY cards may need it). The intent JSON can still override it.
      if (!methodId || methodId === 'CARD' || methodId === SAVED || EXPRESS_IDS.includes(methodId)) {
        body.threeds = { enabled: true, ...(body.threeds as object) };
      }
      if (!body.flow_id) body.operation = methodId && AUTHORIZE_METHODS.includes(methodId) ? 'authorize' : (body.operation ?? 'purchase');
      const res = await createPaymentIntent(session, body);
      applyIntentSecret(s, session, res.data.intent_secret);
      setIntentSecret(res.data.intent_secret ?? null);
      setIntentId(res.data.id);
      return res.data.id;
    },
    [intentBody, session, customerId],
  );

  // Load methods once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const s = await createSdk(session);
        setSdk(s);
        const flowId = typeof intentBody.flow_id === 'string' ? intentBody.flow_id : undefined;
        const customer = customerId || (typeof intentBody.customer === 'string' ? intentBody.customer : undefined);
        const base = {
          currency: String(intentBody.amount_currency),
          amount: Number(intentBody.amount),
          // Guest first: no customer yet, so no saved cards in this call.
          ...(customer && !guestFirst ? { customer } : {}),
          ...(flowId ? { flowId } : {}),
        };
        if (mode === 'intent-first') {
          const id = await createIntent(s);
          // The intent already knows the amount, currency, customer and flow, so
          // getMethods({ intentId }) returns its methods, wallets and saved cards. Tamara /
          // Tabby only appear when the intent itself is created with operation "authorize".
          const m = await s.getMethods({ intentId: id });
          let express = m.expressMethods ?? [];
          // Intent-scoped results can list wallets with nativePayData: null; the button
          // needs it, so read the wallet config once from the account-level call.
          if (express.length && !express.some(w => w.nativePayData)) {
            noteNextCall('getMethods', 'Wallet setup: the intent-scoped getMethods listed the wallets with nativePayData: null, so the store read the wallet config once at account level.');
            const account = await s.getMethods({ ...base, ...(flowId ? {} : { operation: 'purchase' as const }) }).catch(() => null);
            if (account?.expressMethods?.length) express = account.expressMethods;
          }
          setMethods({ payment: withoutWallets(m.paymentMethods), express, saved: m.savedCards ?? [] });
          return;
        }
        // No intent yet, so ask by amount and currency. BNPL providers (Tamara, Tabby) only
        // support authorize, so the shop makes a second, parallel call for those; with a
        // flow the flow decides the operation and one call is enough.
        if (guestFirst) noteNextCall('getMethods', 'Generic lookup: the customer has not signed in yet, so no customer is sent and no saved cards come back.');
        else
          noteNextCall(
            'getMethods',
            flowId && customer
              ? 'Flow and customer: the dashboard flow decides the methods and routing, and the customer adds their saved cards.'
              : flowId
                ? 'Flow, guest: the dashboard flow decides the methods and routing; with no customer there are no saved cards.'
                : customer
                  ? 'Customer, no flow: the account’s default methods plus the customer’s saved cards.'
                  : 'Amount and currency only: the account’s default methods, no saved cards.',
          );
        // Your console edits choose the operation or flow themselves, so the second call would repeat the first.
        const edits = sdkEditsFor('getMethods');
        const edited = !!edits && ['operation', 'flowId'].some(k => k in edits.set || edits.removed.includes(k));
        const second = !flowId && !edited;
        if (second)
          noteNextCall('getMethods', 'Second, parallel call with operation: authorize. BNPL providers (Tamara, Tabby) only support authorize, so they are listed by this call and merged in. With a flow, one call is enough.');
        const [purchase, authorize] = await Promise.all([
          s.getMethods({ ...base, ...(flowId ? {} : { operation: 'purchase' as const }) }),
          second ? s.getMethods({ ...base, operation: 'authorize' as const }).catch(() => null) : null,
        ]);
        let payment = purchase.paymentMethods;
        if (authorize) payment = payment.concat(authorize.paymentMethods.filter(m => AUTHORIZE_METHODS.includes(m.id) && !payment.some(p => p.id === m.id)));
        payment = withoutWallets(payment).sort((a, b) => (a.id === 'CARD' ? -1 : b.id === 'CARD' ? 1 : a.title.localeCompare(b.title)));
        setMethods({ payment, express: purchase.expressMethods ?? [], saved: purchase.savedCards ?? [] });
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [mode, session, intentBody, createIntent, customerId, guestFirst]);

  /** Methods lookup "generic, then the customer": the same getMethods, now with the customer, adds their saved cards. */
  async function customerSignsIn() {
    if (!sdk || !customerId) return;
    setBusy('signin');
    setError(null);
    try {
      const flowId = typeof intentBody.flow_id === 'string' ? intentBody.flow_id : undefined;
      noteNextCall('getMethods', 'Customer lookup: the customer signed in, so the same call is made with customer to add their saved cards.');
      const m = await sdk.getMethods({
        currency: String(intentBody.amount_currency),
        amount: Number(intentBody.amount),
        customer: customerId,
        ...(flowId ? { flowId } : { operation: 'purchase' as const }),
      });
      setMethods(prev => (prev ? { ...prev, saved: m.savedCards ?? [] } : prev));
      setSignedIn(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  /** Shop's handlePayWithSavedCard: intent (if none) → proceedWith savedCard + CVV. */
  async function payWithSavedCard(card: Card, cvv: string) {
    if (!sdk) return;
    setError(null);
    const id = intentId ?? (await createIntent(sdk, SAVED));
    const d = await sdk.proceedWith({ intentId: id, type: 'savedCard', id: card.id, metaData: { cvv } });
    const sd = d.stateDetails as { url?: string; renderStrategy?: string } | null;
    if (sd?.url && sd.renderStrategy === 'REDIRECT') {
      window.location.href = sd.url;
      return;
    }
    setSelected(SAVED);
    setDetails(d);
  }

  async function deleteSavedCard(card: Card) {
    if (!sdk || !intentSecret) return;
    await sdk.deleteCard({ cardId: card.id, intentSecret });
    setMethods(m => (m ? { ...m, saved: m.saved.filter(c => c.id !== card.id) } : m));
  }

  async function selectMethod(methodId: string) {
    if (!sdk || busy) return;
    setSelected(methodId);
    setBusy(methodId);
    setError(null);
    try {
      if (!intentId) {
        const id = await createIntent(sdk, methodId);
        // Documented step (sdk-architecture#get-intent-details), as the shop does: your server
        // created the intent, so the browser reads its state and form fields once.
        noteNextCall('getIntentDetails', 'Needed once: your server created the intent with the chosen method, so the browser reads its state and form fields (e.g. the card form) to know what to show.');
        setDetails(await sdk.getIntentDetails(id));
      } else {
        setDetails(await sdk.proceedWith({ intentId, type: 'method', id: methodId }));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const onReceipt = useCallback(
    async (methodId: string, receipt: NativeReceiptData) => {
      if (!sdk) throw new Error('SDK not ready');
      setBusy(methodId);
      setError(null);
      try {
        const id = intentId ?? (await createIntent(sdk, methodId));
        await sdk.proceedWith({ intentId: id, type: 'method', id: methodId });
        const d = await sdk.submitPaymentReceipt({ intentId: id, nativeReceiptData: receipt });
        setSelected(methodId);
        setDetails(d);
      } catch (e) {
        setError(errorText(e));
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [sdk, intentId, createIntent],
  );

  // When the checkout part is over, go to the order page.
  useEffect(() => {
    if (details && intentId && checkoutIsDone(details)) router.replace(orderUrl(intentId));
  }, [details, intentId, router]);

  if (!methods || !sdk) {
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> Loading payment methods…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <ExpressCheckout methods={methods.express} sdk={sdk} live={session.env === 'production'} onReceipt={onReceipt} />
      <WalletNote express={methods.express} />
      {EXPRESS_IDS.includes(selected ?? '') && details && intentId && (
        <StateRenderer sdk={sdk} intentId={intentId} details={details} method={selected!} layout={cardLayout} payLabel={`Pay ${amountLabel}`} onDetails={setDetails} />
      )}

      {guestFirst && !signedIn && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-input p-4">
          <span className="text-sm text-subtle">
            {customerId ? 'Checking out as a guest: methods and wallets only, no saved cards yet.' : 'Pick a customer on the details page to show the sign-in step.'}
          </span>
          {customerId && (
            <Button variant="outline" size="sm" disabled={!!busy} onClick={customerSignsIn}>
              {busy === 'signin' && <Loader2 className="size-4 animate-spin" />}
              Customer signs in
            </Button>
          )}
        </div>
      )}
      {methods.saved.length > 0 && (
        <div className="relative rounded border p-4 pt-8">
          <p className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-sm text-bolder">Saved cards</p>
          <SavedCards
            cards={methods.saved}
            disabled={!!busy}
            payLabel={c => `Pay ${amountLabel} with •••• ${c.last4}`}
            onPay={payWithSavedCard}
            selectedId={selected === SAVED ? savedId : null}
            onSelect={id => {
              setSavedId(id);
              setSelected(SAVED);
              setDetails(null);
            }}
            onDelete={intentSecret ? deleteSavedCard : undefined}
          />
          {!intentSecret && <p className="mt-2 text-xs text-subtler">Cards can be deleted once an intent exists (deleteCard needs its intent secret).</p>}
          {selected === SAVED && details && intentId && (
            <StateRenderer sdk={sdk} intentId={intentId} details={details} method="CARD" layout={cardLayout} payLabel={`Pay ${amountLabel}`} onDetails={setDetails} />
          )}
        </div>
      )}

      <div>
        <h3 className="font-medium text-bolder">Payment method</h3>
        <p className="text-sm text-subtler">All transactions are secure and encrypted.</p>
        <div className="mt-2 divide-y divide-input rounded-md border border-input">
          {methods.payment.length === 0 && <p className="p-4 text-sm text-subtle">No payment methods for this amount and currency.</p>}
          {methods.payment.map(m => (
            <div key={m.id}>
              <label className={cn('flex h-[57px] cursor-pointer items-center gap-4 p-4', busy && 'cursor-wait', busy === m.id && 'animate-pulse')}>
                <input
                  type="radio"
                  name="mh-method"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selected === m.id}
                  disabled={!!busy}
                  onChange={() => selectMethod(m.id)}
                />
                {m.icons?.[0] && (
                  // Method icons come from MoneyHash.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.icons[0]} alt="" className="h-[24px] w-[34px] object-contain" />
                )}
                <span className="text-bolder">{m.title}</span>
              </label>
              {selected === m.id && !busy && details && intentId && (
                <StateRenderer
                  sdk={sdk}
                  intentId={intentId}
                  details={details}
                  method={m.id}
                  layout={cardLayout}
                  payLabel={`Pay ${amountLabel}`}
                  onDetails={setDetails}
                  offerSaveCard={!!customerId}
                  onRetry={id => {
                    setDetails(null);
                    if (id) selectMethod(id);
                    else setSelected(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const WALLETS = [
  { id: 'APPLE_PAY', name: 'Apple Pay', where: 'Safari on an Apple device with a card in Wallet; the domain must be registered for Apple Pay.' },
  { id: 'GOOGLE_PAY', name: 'Google Pay', where: 'Chrome or Android with a Google account; TEST mode offers test cards.' },
  { id: 'SAMSUNG_PAY', name: 'Samsung Pay', where: 'Samsung devices or Samsung Internet with Samsung Pay set up.' },
];

/** Why a wallet button is or isn't there: enabled on the account (nativePayData) and what the device needs. */
function WalletNote({ express }: { express: Method[] }) {
  const enabled = new Set<string>(express.filter(m => m.nativePayData).map(m => m.id));
  return (
    <details className="-mt-5 text-xs text-subtle">
      <summary className="cursor-pointer select-none text-subtler hover:text-subtle">Don&apos;t see a wallet?</summary>
      <ul className="mt-2 space-y-1.5 rounded-md border p-3">
        {WALLETS.map(w => (
          <li key={w.id} className="flex gap-2">
            <span className={cn('mt-1 size-2 shrink-0 rounded-full', enabled.has(w.id) ? 'bg-green-600' : 'bg-subtler')} aria-hidden />
            <span>
              <span className="font-medium text-bolder">{w.name}</span>{' '}
              {enabled.has(w.id) ? 'is enabled on this account. Needs:' : 'is not enabled for this amount, currency or account.'}{' '}
              {enabled.has(w.id) && w.where}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** What the intent needs next (shop's IntentStateRenderer). */
export function StateRenderer({
  sdk,
  intentId,
  details,
  method,
  layout,
  payLabel,
  onDetails,
  offerSaveCard = false,
  onRetry,
}: {
  sdk: Sdk;
  intentId: string;
  details: Details;
  method: string;
  layout: 'compact' | 'expanded';
  payLabel: string;
  onDetails: (d: Details) => void;
  offerSaveCard?: boolean;
  /** After a failure: retry with a method (null = let the customer choose again). */
  onRetry?: (methodId: string | null) => void;
}) {
  const state = details.state as string;
  const sd = details.stateDetails as Record<string, unknown> | null;

  if (state === 'FORM_FIELDS') {
    const formFields = (sd?.formFields ?? {}) as { billing?: Field[] | null; shipping?: Field[] | null; card?: unknown };
    const isCard = method === 'CARD' || !!formFields.card;
    // Methods without a card (e.g. STC Pay, Bank Transfer, Cash on Delivery) only need
    // the billing / shipping details MoneyHash lists, sent with submitForm.
    if (!isCard) {
      return <FieldsForm sdk={sdk} intentId={intentId} method={method} billing={formFields.billing} shipping={formFields.shipping} payLabel={payLabel} onDetails={onDetails} />;
    }
    return (
      <CardForm
        key={`${intentId}-${layout}`}
        sdk={sdk}
        layout={layout}
        billingFields={formFields.billing}
        payLabel={payLabel}
        offerSaveCard={offerSaveCard && isCard}
        onPay={async ({ billingData, saveCard }) => {
          const save = saveCard !== undefined ? { saveCard } : {};
          // cardForm.pay always submits as CARD. Card-like methods (Mada, KNET cards,
          // Meeza…) must be submitted as themselves: submitForm with the method and the
          // card form's access token from state_details, which tokenises the same fields.
          const accessToken = (formFields.card as { accessToken?: string } | null | undefined)?.accessToken;
          if (method !== 'CARD' && accessToken) {
            const d = await sdk.submitForm({ intentId, accessToken, paymentMethod: method as never, billingData, ...save });
            return redirectOr(d, onDetails);
          }
          // Tokenise the card in the vault, then pay.
          const cardData = await sdk.cardForm.collect();
          const d = await sdk.cardForm.pay({ intentId, cardData, billingData, ...save });
          redirectOr(d, onDetails);
        }}
      />
    );
  }
  if (state === 'SAVED_CARD_CVV') {
    const card = (sd?.card ?? {}) as { last4?: string; brand?: string };
    return <CvvStep sdk={sdk} intentId={intentId} label={`CVV for ${card.brand ?? 'card'} •••• ${card.last4 ?? ''}`} onDetails={onDetails} />;
  }
  if (state === 'URL_TO_RENDER' && sd && typeof sd.url === 'string') {
    return <UrlToRender sdk={sdk} intentId={intentId} url={sd.url} strategy={sd.renderStrategy as Strategy} onDetails={onDetails} />;
  }
  if (state === 'OTP_FORM') {
    return <OtpStep sdk={sdk} intentId={intentId} length={Number(sd?.otpLength) || 0} otpData={(sd?.intentOtpData ?? {}) as Record<string, unknown>} onDetails={onDetails} />;
  }
  if (state === 'INSTALLMENT_PLANS') {
    return <InstallmentPlansStep sdk={sdk} intentId={intentId} plans={(sd?.plans ?? []) as InstallmentPlan[]} onDetails={onDetails} />;
  }
  if (state === 'INTENT_FORM') return <IntentForm sdk={sdk} intentId={intentId} onDetails={onDetails} />;
  if (state === 'PROCESSING') return <Processing sdk={sdk} intentId={intentId} onDetails={onDetails} />;
  if (state === 'TRANSACTION_FAILED') return <RetryPanel sdk={sdk} intentId={intentId} details={details} onDetails={onDetails} onRetry={onRetry} />;
  // Order placed; the flow opens the order page with the provider's instructions.
  if (['INTENT_PROCESSED', 'TRANSACTION_WAITING_USER_ACTION', 'CLOSED', 'EXPIRED'].includes(state)) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> Opening your order…
      </p>
    );
  }
  if (state === 'METHOD_SELECTION') return null;
  return <p className="p-4 text-sm text-subtle">State {state} is not covered in the playground yet.</p>;
}

/**
 * TRANSACTION_FAILED: the attempt failed but the intent is still open. MoneyHash may
 * suggest methods to retry with (recommendedMethods); resetSelectedMethod puts the
 * intent back to METHOD_SELECTION so the customer can pick any method again.
 */
function RetryPanel({
  sdk,
  intentId,
  details,
  onDetails,
  onRetry,
}: {
  sdk: Sdk;
  intentId: string;
  details: Details;
  onDetails: (d: Details) => void;
  onRetry?: (methodId: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tx = (details.transaction ?? {}) as Record<string, unknown>;
  const reason = [tx.responseMessage, tx.response_message, tx.localizedResponseMessage, tx.status].find(v => typeof v === 'string' && v) as string | undefined;
  const recommended = ((details as { recommendedMethods?: Method[] | null }).recommendedMethods ?? []).filter(m => m?.id);

  async function retry(methodId: string | null) {
    setBusy(methodId ?? 'reset');
    setError(null);
    try {
      // Back to method selection on the same intent, then the chosen method (if any).
      const reset = await sdk.resetSelectedMethod(intentId);
      if (onRetry) onRetry(methodId);
      else if (methodId) onDetails(await sdk.proceedWith({ intentId, type: 'method', id: methodId }));
      else onDetails(reset);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-sm font-medium text-destructive">The payment did not go through</p>
        {reason && <p className="text-sm text-subtle">{reason}</p>}
      </div>
      {recommended.length > 0 && (
        <div>
          <p className="text-xs text-subtle">MoneyHash suggests trying:</p>
          <div className="mt-2 divide-y divide-input rounded-md border border-input">
            {recommended.map(m => (
              <button key={m.id} className="flex w-full items-center gap-4 p-3 text-left hover:bg-accent disabled:opacity-60" disabled={!!busy} onClick={() => retry(m.id)}>
                {m.icons?.[0] && (
                  // Method icons come from MoneyHash.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.icons[0]} alt="" className="h-[24px] w-[34px] object-contain" />
                )}
                <span className="flex-1 text-sm text-bolder">{m.title}</span>
                {busy === m.id && <Loader2 className="size-4 animate-spin" />}
              </button>
            ))}
          </div>
        </div>
      )}
      <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => retry(null)}>
        {busy === 'reset' && <Loader2 className="size-4 animate-spin" />}
        Choose another payment method
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** SAVED_CARD_CVV: the saved card needs its CVV (submitCvv). */
function CvvStep({ sdk, intentId, label, onDetails }: { sdk: Sdk; intentId: string; label: string; onDetails: (d: Details) => void }) {
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-start gap-3 p-4">
      <Input label={label} inputMode="numeric" maxLength={4} value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, ''))} containerClassName="flex-1" />
      <Button
        className="h-10"
        disabled={cvv.length < 3 || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            redirectOr(await sdk.submitCvv({ intentId, cvv }), onDetails);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Pay
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** FORM_FIELDS without a card: billing / shipping details, then submitForm. */
function FieldsForm({
  sdk,
  intentId,
  method,
  billing,
  shipping,
  payLabel,
  onDetails,
}: {
  sdk: Sdk;
  intentId: string;
  method: string;
  billing?: Field[] | null;
  shipping?: Field[] | null;
  payLabel: string;
  onDetails: (d: Details) => void;
}) {
  // Pre-filled from the details entered on the checkout page.
  const customer = useConfig(c => c.customer);
  const [billingData, setBillingData] = useState<Record<string, string>>(() => prefillFields(billing, customer));
  const [shippingData, setShippingData] = useState<Record<string, string>>(() => prefillFields(shipping, customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = fieldsComplete(billing, billingData) && fieldsComplete(shipping, shippingData);
  return (
    <div className="space-y-4 p-4">
      {!!billing?.length && <BillingFields fields={billing} values={billingData} onChange={(n, v) => setBillingData(b => ({ ...b, [n]: v }))} />}
      {!!shipping?.length && (
        <BillingFields title="Shipping details" fields={shipping} values={shippingData} onChange={(n, v) => setShippingData(s => ({ ...s, [n]: v }))} />
      )}
      <Button
        className="w-full"
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const d = await sdk.submitForm({
              intentId,
              paymentMethod: method as never,
              ...(billing?.length ? { billingData } : {}),
              ...(shipping?.length ? { shippingData } : {}),
            });
            redirectOr(d, onDetails);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {payLabel}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** OTP_FORM: a one-time code from the provider (e.g. STC Pay), sent with submitOtp. */
function OtpStep({ sdk, intentId, length, otpData, onDetails }: { sdk: Sdk; intentId: string; length: number; otpData: Record<string, unknown>; onDetails: (d: Details) => void }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-subtle">Enter the one-time code sent to your phone.</p>
      <div className="flex items-start gap-3">
        <Input
          label="One-time code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length || 8}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          containerClassName="flex-1"
        />
        <Button
          className="h-10"
          disabled={(length ? otp.length !== length : otp.length < 4) || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              redirectOr(await sdk.submitOtp({ intentId, otp, intentOtpData: otpData }), onDetails);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Confirm
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** INSTALLMENT_PLANS: the customer picks a plan (bank installments), sent with selectInstallmentPlan. */
function InstallmentPlansStep({ sdk, intentId, plans, onDetails }: { sdk: Sdk; intentId: string; plans: InstallmentPlan[]; onDetails: (d: Details) => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find(p => p.id === planId);
  if (!plans.length) return <p className="p-4 text-sm text-subtle">No installment plans are available for this card.</p>;
  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-subtle">Choose how to split the payment.</p>
      <div className="divide-y divide-input rounded-md border border-input">
        {plans.map(p => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm">
            <input type="radio" name="mh-plan" className="size-4 accent-[hsl(var(--primary))]" checked={p.id === planId} onChange={() => setPlanId(p.id)} />
            {p.issuerLogoEn && (
              // Issuer logos come from MoneyHash.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.issuerLogoEn} alt="" className="h-5 w-8 object-contain" />
            )}
            <span className="flex-1 text-bolder">
              {p.installmentPeriod} months × {p.amount.formatted} {p.amount.currency}
              {p.issuerNameEn && <span className="text-subtle"> · {p.issuerNameEn}</span>}
            </span>
            <span className="text-xs text-subtle">
              {p.interestRate ? `${p.interestRate}% interest` : 'No interest'}
              {p.feeDisplayValue ? ` · fees ${p.feeDisplayValue}` : ''}
            </span>
          </label>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={!plan || busy}
        onClick={async () => {
          if (!plan) return;
          setBusy(true);
          setError(null);
          try {
            redirectOr(await sdk.selectInstallmentPlan({ intentId, planId: plan.id, ...(plan.issuerCode ? { issuerCode: plan.issuerCode } : {}) }), onDetails);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

type Strategy = 'IFRAME' | 'POPUP_IFRAME' | 'REDIRECT';

/** The checkout's 3DS setting: "redirect" sends the customer to the provider page instead of rendering it here. */
export const ThreeDsMode = createContext<'page' | 'redirect'>('page');

/** Shop rule: a REDIRECT render strategy skips the loader and goes straight to the URL. */
function redirectOr(d: Details, onDetails: (d: Details) => void) {
  const sd = d.stateDetails as { url?: string; renderStrategy?: string } | null;
  if (sd?.url && sd.renderStrategy === 'REDIRECT') {
    window.location.href = sd.url;
    return;
  }
  onDetails(d);
}

function UrlToRender({ sdk, intentId, url, strategy: given, onDetails }: { sdk: Sdk; intentId: string; url: string; strategy: Strategy; onDetails: (d: Details) => void }) {
  const mode = useContext(ThreeDsMode);
  const strategy: Strategy = mode === 'redirect' ? 'REDIRECT' : given;
  const started = useRef(false);
  useEffect(() => {
    if (started.current || strategy === 'POPUP_IFRAME') return;
    started.current = true;
    if (strategy === 'REDIRECT') {
      window.location.href = url;
      return;
    }
    sdk.renderUrl({ intentId, url, renderStrategy: strategy }).then(onDetails);
  }, [sdk, intentId, url, strategy, onDetails]);

  if (strategy === 'POPUP_IFRAME') {
    return (
      <div className="flex gap-3 p-4">
        <Button size="sm" onClick={() => sdk.renderUrl({ intentId, url, renderStrategy: strategy }).then(onDetails)}>
          Continue payment
        </Button>
        <p className="text-xs text-subtle">A new window opens to finish the payment. If it didn&apos;t, click the button.</p>
      </div>
    );
  }
  if (strategy === 'IFRAME') return <div id="rendered-url-iframe-container" className="h-[520px]" />;
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-subtle" />
    </div>
  );
}

/**
 * renderForm's iframe is created without allow="payment", so Google Pay / Apple Pay
 * inside MoneyHash's form cannot open their sheets (Google: iframes need
 * allow="payment"). The SDK inserts it with container.replaceChildren(iframe);
 * add the permission just before insertion, so it applies to the first load.
 */
function allowWalletsIn(container: HTMLElement | null) {
  if (!container) return;
  const original = container.replaceChildren.bind(container);
  container.replaceChildren = (...nodes: (Node | string)[]) => {
    for (const n of nodes) if (n instanceof HTMLIFrameElement) n.allow = 'payment *';
    original(...nodes);
  };
}

/** INTENT_FORM: this step is handled by MoneyHash's embed (e.g. hosted wallets). Sized to its content. */
export function IntentForm({ sdk, intentId, onDetails }: { sdk: Sdk; intentId: string; onDetails: (d: Details) => void }) {
  const started = useRef(false);
  const [height, setHeight] = useState(520);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    allowWalletsIn(document.getElementById('moneyHash-intent-form'));
    sdk
      .renderForm({ selector: '#moneyHash-intent-form', intentId, onHeightChange: (h: number) => h > 0 && setHeight(h) } as Parameters<Sdk['renderForm']>[0])
      .then(onDetails);
  }, [sdk, intentId, onDetails]);
  return <div id="moneyHash-intent-form" style={{ height }} className="w-full transition-[height]" />;
}

function Processing({ sdk, intentId, onDetails }: { sdk: Sdk; intentId: string; onDetails: (d: Details) => void }) {
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const d = await sdk.getIntentDetails(intentId).catch(() => null);
      if (stopped) return;
      if (d && d.state !== 'PROCESSING') onDetails(d);
      else setTimeout(tick, 3000);
    };
    const t = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [sdk, intentId, onDetails]);
  return (
    <p className="flex items-center gap-2 p-4 text-sm text-subtle">
      <Loader2 className="size-4 animate-spin" /> Processing the payment…
    </p>
  );
}
