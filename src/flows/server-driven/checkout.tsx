'use client';
// Checkout for the External and Direct APIs. Your backend creates the intent and
// drives it; the frontend only does what has to happen in the browser.
//   POST /{api}/payments/intent/                      → METHOD_SELECTION + methods, saved cards
//   POST /{api}/payments/intents/{id}/update-method/  → FORM_FIELDS (card) or URL_TO_RENDER
//   POST /{api}/payments/intents/{id}/card_token/     → pay with a saved card
// The page shows wallets, saved cards and every method together; the settings
// decide what happens in the browser:
//   card entry  sdk (SDK card fields: MoneyHash iframes, engineering's guidance for External),
//               embed (MoneyHash's embed, the public-docs option), own (Direct only: your
//               form → your server → vault)
//   wallets     own (your Apple Pay / Google Pay buttons; your server validates the Apple
//               session and posts the receipt to …/receipt/) or sdk (proceedWith + submitPaymentReceipt)
//   3DS         page (the SDK renders it here) or redirect
// Steps the APIs can't drive yet (OTP, instalments, saved-card CVV, non-card form
// fields) fall back to the SDK on the same intent.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { serverIntentCall, type MhEnvelope, type ServerApi } from '@/lib/api-client';
import { formatMoney, type Currency } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { useConfig } from '@/store/config';
import { WebhookWatcher } from '@/components/webhook-watcher';
import { accountKey, embedUrlFor } from '../session';
import { useWebhookRedirect } from '../use-webhook-redirect';
import { StateRenderer, checkoutIsDone, orderUrl } from '../sdk/checkout/sdk-checkout';
import { CardForm, errorText } from '../sdk/checkout/card-form';
import { applyIntentSecret, createSdk, noteNextCall, type Sdk } from '../sdk/runtime';
import { ExpressCheckout } from '../sdk/checkout/express';
import type { Field, Method, NativeReceiptData } from '@moneyhash/js-sdk/headless';
import type { FlowCheckoutProps } from '../types';
import type { CheckoutSettings } from '../selection';


type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

type ExtMethod = { id: string; title: string; icon?: string };
type ExtCard = { id: string; label: string; expiry?: string; logo?: string; requiresCvv: boolean };
type ExtState = { state: string; details: Obj };
type Details = Awaited<ReturnType<Sdk['getIntentDetails']>>;

/** States after which the checkout page has nothing left to do. */
const DONE = ['INTENT_PROCESSED', 'TRANSACTION_WAITING_USER_ACTION', 'EXPIRED', 'CLOSED'];

function readMethods(details: Obj): ExtMethod[] {
  return ((details.payment_methods as unknown[]) ?? [])
    .map(m => {
      const o = obj(m);
      const id = str(o.payment_method) ?? '';
      return { id, title: str(o.payment_method_name) ?? id, icon: str((o.checkout_icons as unknown[] | undefined)?.[0]) };
    })
    .filter(m => m.id);
}

/** The saved-card schema is not fully documented, so read the common spellings. */
function readCards(details: Obj): ExtCard[] {
  return ((details.saved_cards as unknown[]) ?? [])
    .map(c => {
      const o = obj(c);
      const last4 = str(o.last_4) ?? str(o.last4) ?? str(o.card_last_four) ?? '••••';
      const brand = str(o.brand) ?? str(o.card_brand) ?? 'Card';
      const month = str(o.expiry_month) ?? (typeof o.expiry_month === 'number' ? String(o.expiry_month) : undefined);
      const year = str(o.expiry_year) ?? (typeof o.expiry_year === 'number' ? String(o.expiry_year) : undefined);
      return {
        id: str(o.hashid) ?? str(o.id) ?? '',
        label: `${brand} •••• ${last4}`,
        expiry: month && year ? `${month}/${year.slice(-2)}` : undefined,
        logo: str(o.logo),
        requiresCvv: o.requires_cvv !== false,
      };
    })
    .filter(c => c.id);
}

const FIELD_TYPES: Record<string, Field['type']> = {
  PhoneNumberField: 'phoneNumber',
  EmailField: 'email',
  ChoiceField: 'select',
  DateField: 'date',
  IntegerField: 'number',
};

/**
 * Billing fields from an External/Direct FORM_FIELDS response, in the SDK's Field
 * shape. The API sends Django-style fields (field_name, required, choices); the
 * SDK sends name / validation / optionsList. Both are accepted.
 */
function billingFieldsOf(details: Obj | undefined): Field[] | undefined {
  const billing = obj(details?.billing);
  const raw = (billing.fields ?? details?.billing_fields ?? obj(details?.formFields).billing) as unknown[] | undefined;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw.map(x => {
    const o = obj(x);
    if (typeof o.name === 'string') return o as unknown as Field;
    const choices = obj(o.choices);
    return {
      name: str(o.field_name) ?? '',
      label: str(o.label) ?? str(o.field_name) ?? '',
      type: FIELD_TYPES[str(o.type) ?? ''] ?? 'text',
      hint: str(o.help_text) ?? '',
      value: str(o.value) ?? '',
      readOnly: o.read_only === true,
      validation: {
        required: o.required === true,
        minLength: typeof o.min_length === 'number' ? o.min_length : null,
        maxLength: typeof o.max_length === 'number' ? o.max_length : null,
      },
      ...(Object.keys(choices).length ? { optionsList: Object.entries(choices).map(([value, label]) => ({ value, label: String(label) })) } : {}),
    } as Field;
  }).filter(f => f.name);
}

/** Steps the External/Direct APIs can't drive server-side yet: the SDK takes over on the same intent. */
// TRANSACTION_FAILED too: the SDK's intent details carry recommendedMethods for the retry panel.
const SDK_STEPS = ['OTP_FORM', 'INSTALLMENT_PLANS', 'SAVED_CARD_CVV', 'INTENT_FORM', 'TRANSACTION_FAILED'];
const WALLET_IDS = ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY'];

/** express_methods from the intent response, in the SDK's Method shape (id + nativePayData). */
function readWallets(details: Obj): Method[] {
  return ((details.express_methods as unknown[]) ?? [])
    .map(m => {
      const o = obj(m);
      const nativePayData = o.native_pay_data ?? o.nativePayData;
      return { id: str(o.payment_method) ?? '', title: str(o.payment_method_name) ?? '', nativePayData } as unknown as Method;
    })
    .filter(m => m.id);
}

type Settings = Pick<CheckoutSettings, 'cardEntry' | 'wallets' | 'threeDs'>;

/**
 * One checkout page for the External and Direct APIs: wallets, saved cards and
 * every method together, as a client's checkout would look. Your server makes the
 * MoneyHash calls; the settings decide the few things that happen in the browser.
 */
export function ServerDrivenCheckout({ intentBody, session, api, settings }: FlowCheckoutProps & { api: ServerApi; settings: Settings }) {
  const router = useRouter();
  const layout = useConfig(c => c.cardFormLayout);
  // A customer (from the Customer section) brings saved cards.
  const customerId = useConfig(c => c.customerIds[accountKey(session)] ?? '');
  const { cardEntry, wallets: walletMode, threeDs } = settings;
  const [intent, setIntent] = useState<{ id: string; secret?: string } | null>(null);
  const [methods, setMethods] = useState<ExtMethod[]>([]);
  const [cards, setCards] = useState<ExtCard[]>([]);
  const [express, setExpress] = useState<Method[]>([]);
  /** Where the wallet config came from: the intent response, or a getMethods call. */
  const [walletSource, setWalletSource] = useState<'intent' | 'getMethods' | null>(null);
  const [current, setCurrent] = useState<ExtState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<Sdk | null>(null);
  const sdkRef = useRef<Promise<Sdk> | null>(null);
  /** Once the SDK takes over (after cardForm.pay, 3DS in the page, OTP, instalments…) it renders the next steps. */
  const [sdkDetails, setSdkDetails] = useState<Details | null>(null);
  const started = useRef(false);
  const amountLabel = formatMoney(Number(intentBody.amount), String(intentBody.amount_currency) as Currency);
  const ownCard = cardEntry === 'own';

  // Direct API with your own form: picking CARD needs no call yet; your server selects CARD and sends the card in one go.
  const cardStep = selected === 'CARD' && ((api === 'direct' && ownCard) || current?.state === 'FORM_FIELDS');
  const embedActive = cardStep && cardEntry === 'embed';
  /** 3DS / provider page from your server's URL_TO_RENDER response, shown in the page (no SDK call). */
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  useWebhookRedirect(embedActive || frameUrl ? (intent?.id ?? null) : null);

  /** The SDK loads only when a step needs it, on the intent your server created. */
  function ensureSdk(secret = intent?.secret): Promise<Sdk> {
    sdkRef.current ??= createSdk(session).then(s => {
      applyIntentSecret(s, session, secret);
      setSdk(s);
      return s;
    });
    return sdkRef.current;
  }

  // SDK card fields need the SDK ready when the card step opens.
  useEffect(() => {
    if (!cardStep || cardEntry !== 'sdk' || !intent) return;
    ensureSdk().catch(e => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardStep, cardEntry, intent]);

  useEffect(() => {
    if (sdkDetails && intent && checkoutIsDone(sdkDetails)) router.push(orderUrl(intent.id));
  }, [sdkDetails, intent, router]);

  /** Every External/Direct response has the same envelope: data.intent, data.state, data.state_details. */
  async function apply(res: MhEnvelope<Obj>, id: string, methodId?: string) {
    const data = obj(res.data);
    const state = str(data.state) ?? str(obj(data.intent).state) ?? '';
    const details = obj(data.state_details);
    setCurrent({ state, details });
    if (DONE.includes(state)) {
      router.push(orderUrl(id));
      return;
    }
    const nonCardForm = state === 'FORM_FIELDS' && methodId && methodId !== 'CARD' && !WALLET_IDS.includes(methodId);
    if (state === 'URL_TO_RENDER') {
      // As the External/Direct docs describe: render state_details.embed_url. In the page
      // it goes into a frame; the final webhook then moves the page on.
      const url = str(details.embed_url) ?? str(details.url);
      if (!url) return;
      if (threeDs === 'redirect') window.location.href = url;
      else setFrameUrl(embedUrlFor(session, { id, intent_secret: intent?.secret, embed_url: url }));
      return;
    }
    if (SDK_STEPS.includes(state) || nonCardForm) {
      const s = await ensureSdk();
      setSdkDetails(await s.getIntentDetails(id));
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  // "Continue to payment" was the go-ahead: the backend creates the intent now.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run('create', async () => {
      const res = await serverIntentCall(session, api, 'create', {
        // With a customer, cards may be saved (the card forms offer "Save this card").
        body: { ...intentBody, ...(customerId ? { customer: customerId, allow_tokenize_card: true } : {}) },
      });
      const data = obj(res.data);
      const i = obj(data.intent);
      const id = str(i.id);
      if (!id) throw new Error('MoneyHash did not return an intent id. See the console.');
      const secret = str(i.intent_secret);
      setIntent({ id, secret });
      const details = obj(data.state_details);
      setMethods(readMethods(details).filter(m => !WALLET_IDS.includes(m.id)));
      setCards(readCards(details));
      await apply(res, id);
      // Wallet buttons need each wallet's native config.
      const fromIntent = readWallets(details);
      if (walletMode === 'own' && fromIntent.some(w => w.nativePayData)) {
        setExpress(fromIntent);
        setWalletSource('intent');
      } else if (fromIntent.length) {
        // The intent response lists the wallets but not their native config (and the
        // intent-scoped getMethods returns nativePayData: null too), so read it once at
        // account level. Your server already has the methods; this call is only for wallets.
        const s = await ensureSdk(secret);
        noteNextCall('getMethods', 'Wallet setup only: the intent response has no native wallet config, so the store read it once at account level (public key).');
        const m = await s.getMethods({ currency: String(intentBody.amount_currency), amount: Number(intentBody.amount), operation: 'purchase' });
        setExpress(m.expressMethods ?? []);
        setWalletSource('getMethods');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(methodId: string) {
    if (!intent || busy) return;
    setSelected(methodId);
    setSdkDetails(null);
    if (api === 'direct' && ownCard && methodId === 'CARD') return;
    run(methodId, async () =>
      apply(await serverIntentCall(session, api, 'update-method', { intentId: intent.id, body: { payment_method: methodId } }), intent.id, methodId),
    );
  }

  function payWithSavedCard(card: ExtCard, cvv: string) {
    if (!intent) return;
    setSelected(`card:${card.id}`);
    setSdkDetails(null);
    run('card', async () =>
      apply(await serverIntentCall(session, api, 'card-token', { intentId: intent.id, body: { card_token_id: card.id, ...(cvv ? { cvv } : {}) } }), intent.id),
    );
  }

  /** Wallet receipt: your server posts it (own buttons), or the SDK does (via SDK). */
  async function payWithWallet(methodId: string, receipt: NativeReceiptData) {
    if (!intent) throw new Error('Not ready');
    setError(null);
    setSelected(methodId);
    try {
      if (walletMode === 'sdk') {
        const s = await ensureSdk();
        await s.proceedWith({ intentId: intent.id, type: 'method', id: methodId });
        setSdkDetails(await s.submitPaymentReceipt({ intentId: intent.id, nativeReceiptData: receipt }));
        return;
      }
      const res = await serverIntentCall(session, api, 'pay-wallet', {
        intentId: intent.id,
        body: { payment_method: methodId, receipt: receipt.receipt, ...(receipt.receiptBillingData ? { receipt_billing_data: receipt.receiptBillingData } : {}) },
      });
      await apply(res, intent.id, methodId);
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  }

  async function validateApplePay(methodId: string, validationUrl: string) {
    const res = await serverIntentCall(session, api, 'applepay-session', { body: { method_id: methodId, validation_url: validationUrl } });
    const data = obj(res.data);
    return Object.keys(obj(data.data)).length ? data.data : data;
  }

  function refresh() {
    if (!intent) return;
    run('state', async () => apply(await serverIntentCall(session, api, 'state', { intentId: intent.id }), intent.id));
  }

  if (!intent) {
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> Your server is creating the intent…
      </p>
    );
  }

  const sdkPanel = () =>
    sdkDetails && sdk ? (
      <StateRenderer
        sdk={sdk}
        intentId={intent.id}
        details={sdkDetails}
        method={selected ?? 'CARD'}
        layout={layout}
        payLabel={`Pay ${amountLabel}`}
        onDetails={setSdkDetails}
        offerSaveCard={!!customerId}
        // Retry on the same intent: your server selects the new method.
        onRetry={id => {
          setSdkDetails(null);
          if (id) pick(id);
          else setSelected(null);
        }}
      />
    ) : null;

  const cardPanel = () => {
    if (cardEntry === 'embed') {
      return (
        <>
          <WebhookWatcher intentId={intent.id} />
          <iframe
            src={embedUrlFor(session, { id: intent.id, intent_secret: intent.secret })}
            title="MoneyHash card entry"
            allow="payment *"
            className="h-[560px] w-full rounded-md border bg-background"
          />
          <p className="text-xs text-subtle">The card is entered in MoneyHash&apos;s embed, which also runs 3DS. The final webhook moves this page on.</p>
        </>
      );
    }
    if (cardEntry === 'sdk') {
      if (!sdk) {
        return (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="size-4 animate-spin" /> Loading the JS SDK card fields…
          </p>
        );
      }
      return (
        <div className="-m-4">
          <CardForm
            key={layout}
            sdk={sdk}
            layout={layout}
            payLabel={`Pay ${amountLabel}`}
            offerSaveCard={!!customerId}
            // Billing fields MoneyHash still needs, in the same form as the card (one submit).
            billingFields={billingFieldsOf(current?.details)}
            onPay={async ({ saveCard, billingData }) => {
              // Card data goes from MoneyHash's iframes to the vault; your server never sees it.
              const cardData = await sdk.cardForm.collect();
              const d = await sdk.cardForm.pay({ intentId: intent.id, cardData, ...(billingData ? { billingData } : {}), ...(saveCard !== undefined ? { saveCard } : {}) });
              const sd = d.stateDetails as { url?: string; renderStrategy?: string } | null;
              if (sd?.url && (sd.renderStrategy === 'REDIRECT' || threeDs === 'redirect')) window.location.href = sd.url;
              else setSdkDetails(d);
            }}
          />
        </div>
      );
    }
    return (
      <OwnCardForm
        payLabel={`Pay ${amountLabel}`}
        offerSaveCard={!!customerId}
        onPay={async card => apply(await serverIntentCall(session, 'direct', 'pay-card', { intentId: intent.id, body: { card } }), intent.id, 'CARD')}
      />
    );
  };

  const walletsReady = express.some(w => w.nativePayData);

  if (frameUrl) {
    return (
      <div className="space-y-2">
        <WebhookWatcher intentId={intent.id} />
        <iframe src={frameUrl} title="Verification" allow="payment *" className="h-[600px] w-full rounded-md border bg-background" />
        <p className="text-xs text-subtle">
          Your server got URL_TO_RENDER with state_details.embed_url; it is shown here. The final webhook moves this page on.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(walletsReady || walletSource === null) && express.length > 0 && (
        <div className="space-y-2">
          {walletsReady && (
            <ExpressCheckout
              methods={express}
              sdk={walletMode === 'sdk' ? (sdk ?? undefined) : undefined}
              live={session.env === 'production'}
              onReceipt={payWithWallet}
              validateApplePay={walletMode === 'own' ? validateApplePay : undefined}
            />
          )}
          <p className="text-xs text-subtler">
            {walletMode === 'own'
              ? 'Your own Apple Pay / Google Pay buttons: your server validates the Apple merchant session and posts the receipt to …/receipt/.'
              : 'Wallets via the SDK: proceedWith + submitPaymentReceipt on the intent your server created.'}
            {walletSource === 'getMethods' && walletMode === 'own' && ' The intent response had no wallet config, so it was read once with getMethods (public key).'}
          </p>
          {WALLET_IDS.includes(selected ?? '') && sdkPanel()}
        </div>
      )}

      {cards.length > 0 && (
        <div className="relative rounded border p-4 pt-8">
          <p className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-sm text-bolder">Saved cards</p>
          <SavedCardList
            cards={cards}
            disabled={!!busy}
            busy={busy === 'card'}
            selectedId={selected?.startsWith('card:') ? selected.slice(5) : null}
            onSelect={id => {
              setSelected(`card:${id}`);
              setSdkDetails(null);
            }}
            onPay={payWithSavedCard}
          />
          {selected?.startsWith('card:') && sdkPanel()}
        </div>
      )}

      <div>
        <h3 className="font-medium text-bolder">Payment method</h3>
        <p className="text-sm text-subtler">Listed by your server from the intent&apos;s state_details.payment_methods.</p>
        <div className="mt-2 divide-y divide-input rounded-md border border-input">
          {methods.length === 0 && <p className="p-4 text-sm text-subtle">No payment methods for this amount and currency.</p>}
          {methods.map(m => (
            <div key={m.id}>
              <label className={cn('flex h-[57px] cursor-pointer items-center gap-4 p-4', busy && 'cursor-wait', busy === m.id && 'animate-pulse')}>
                <input
                  type="radio"
                  name="mh-ext-method"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selected === m.id}
                  disabled={!!busy}
                  onChange={() => pick(m.id)}
                />
                {m.icon && (
                  // Method icons come from MoneyHash.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.icon} alt="" className="h-[24px] w-[34px] object-contain" />
                )}
                <span className="text-bolder">{m.title}</span>
              </label>
              {selected === m.id && (sdkDetails || cardStep) && <div className="space-y-3 border-t p-4">{sdkDetails ? sdkPanel() : cardPanel()}</div>}
            </div>
          ))}
        </div>
      </div>

      {current && !cardStep && !sdkDetails && !['METHOD_SELECTION', 'URL_TO_RENDER', ...DONE].includes(current.state) && (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span className="text-subtle">
            Intent state: <span className="font-mono text-bolder">{current.state}</span>
          </span>
          <Button size="sm" variant="outline" onClick={refresh} disabled={!!busy}>
            <RefreshCw className="size-3.5" /> Check state
          </Button>
        </div>
      )}
      {current?.state === 'URL_TO_RENDER' && !sdkDetails && (
        <p className="flex items-center gap-2 text-sm text-subtle">
          <Loader2 className="size-4 animate-spin" /> {threeDs === 'redirect' ? 'Sending you to the provider’s page…' : 'Loading the next step…'}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

type RawCard = { card_holder_name: string; card_number: string; expiry_month: string; expiry_year: string; cvv: string; save_card: boolean };

/**
 * Direct API: the merchant's own card form. The card goes to your server, which
 * sends it to the vault (PCI DSS). The playground only accepts test cards.
 */
function OwnCardForm({ payLabel, onPay, offerSaveCard }: { payLabel: string; onPay: (card: RawCard) => Promise<void>; offerSaveCard: boolean }) {
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvv: '' });
  const [saveCard, setSaveCard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = card.number.replace(/\D/g, '');
  const [mm, yy] = card.expiry.split('/').map(s => s.trim());
  const ok = card.name.trim() && digits.length >= 12 && /^\d{2}$/.test(mm ?? '') && /^\d{2}$/.test(yy ?? '') && /^\d{3,4}$/.test(card.cvv);
  return (
    <div className="space-y-3">
      <p className="text-xs text-subtle">
        Your own form: the card number goes to your server and then to MoneyHash&apos;s vault, so this needs PCI DSS. MoneyHash validates the
        card and returns any errors.
      </p>
      <Input label="Name on card" autoComplete="cc-name" value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))} />
      <Input
        label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        value={card.number}
        onChange={e => setCard(c => ({ ...c, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Expiry (MM / YY)"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={card.expiry}
          onChange={e => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 4);
            setCard(c => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d }));
          }}
        />
        <Input label="CVV" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '') }))} />
      </div>
      {offerSaveCard && (
        <label className="flex items-center gap-2 text-sm text-subtle">
          <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />
          Save this card for next time
        </label>
      )}
      <Button
        className="w-full"
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onPay({ card_holder_name: card.name.trim(), card_number: digits, expiry_month: mm, expiry_year: yy, cvv: card.cvv, save_card: offerSaveCard && saveCard });
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

function SavedCardList({
  cards,
  disabled,
  busy,
  selectedId,
  onSelect,
  onPay,
}: {
  cards: ExtCard[];
  disabled: boolean;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPay: (c: ExtCard, cvv: string) => void;
}) {
  const selected = selectedId ?? '';
  const [cvv, setCvv] = useState('');
  const card = cards.find(c => c.id === selected);
  return (
    <div className="space-y-3">
      <div className="divide-y divide-input rounded-md border border-input">
        {cards.map(c => (
          <label key={c.id} className="flex cursor-pointer items-center gap-4 p-4">
            <input
              type="radio"
              name="mh-ext-card"
              className="size-4 accent-[hsl(var(--primary))]"
              checked={selected === c.id}
              disabled={disabled}
              onChange={() => (onSelect(c.id), setCvv(''))}
            />
            {c.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logo} alt="" className="h-6 w-[34px] object-contain" />
            ) : (
              <CreditCard className="size-6 text-subtler" />
            )}
            <span className="flex-1 text-sm capitalize text-bolder">{c.label}</span>
            {c.expiry && <span className="text-sm text-subtle">{c.expiry}</span>}
          </label>
        ))}
      </div>
      <p className="text-xs text-subtle">MoneyHash lists only the saved cards usable for this payment (same provider connection, currency and flow), so a customer may have more.</p>
      {card && (
        <div className="flex items-start gap-3">
          {card.requiresCvv && (
            <Input label="CVV" inputMode="numeric" maxLength={4} value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, ''))} containerClassName="w-32" />
          )}
          <Button className="h-10 flex-1" disabled={disabled || (card.requiresCvv && cvv.length < 3)} onClick={() => onPay(card, cvv)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Pay with {card.label}
          </Button>
        </div>
      )}
    </div>
  );
}
