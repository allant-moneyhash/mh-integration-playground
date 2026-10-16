'use client';
// Two frontends that work on every backend API:
//   renderForm on an External/Direct intent: your server creates it, the SDK draws MoneyHash's form.
//   Merchant-initiated (no frontend): your backend charges a saved card without the customer present.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPaymentIntent, getAgreement, listCustomerCards, serverIntentCall, type CustomerCard, type ServerApi } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useConfig } from '@/store/config';
import type { BackendApi, FlowCheckoutProps } from '../types';
import { IntentForm, orderUrl } from '../sdk/checkout/sdk-checkout';
import { errorText } from '../sdk/checkout/card-form';
import { applyIntentSecret, createSdk, type Sdk } from '../sdk/runtime';
import { accountKey, embedUrlFor } from '../session';
import { useWebhookRedirect } from '../use-webhook-redirect';
import { WebhookWatcher } from '@/components/webhook-watcher';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** renderForm on an intent your server created with the External or Direct API. */
export function ServerRenderForm({ intentBody, session, api }: FlowCheckoutProps & { api: ServerApi }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<{ sdk: Sdk; intentId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await serverIntentCall(session, api, 'create', { body: intentBody });
        const intent = obj(obj(res.data).intent);
        const id = typeof intent.id === 'string' ? intent.id : '';
        if (!id) throw new Error('MoneyHash did not return an intent id. See the console.');
        const sdk = await createSdk(session);
        applyIntentSecret(sdk, session, typeof intent.intent_secret === 'string' ? intent.intent_secret : undefined);
        setCtx({ sdk, intentId: id });
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [api, intentBody, session]);

  if (ctx) return <IntentForm sdk={ctx.sdk} intentId={ctx.intentId} onDetails={() => router.replace(orderUrl(ctx.intentId))} />;
  return error ? (
    <p className="text-sm text-destructive">{error}</p>
  ) : (
    <p className="flex items-center gap-2 text-sm text-subtle">
      <Loader2 className="size-4 animate-spin" /> Your server is creating the intent…
    </p>
  );
}

/**
 * Merchant-initiated charge of a saved card (no customer on the page), the same
 * on every API. Checked before charging, as MoneyHash's MIT guide describes:
 *   - the card comes from GET /customers/{id}/cards/ (all cards; card_token = its
 *     UUID id, not the SDK's short hashid) and must not be expired
 *   - an agreement set up by an earlier customer-present payment (CIT) with
 *     payment_type UNSCHEDULED + recurring_data.agreement_id must be active
 *     (GET /agreements/{id}/)
 * Then: POST {api}/payments/intent/ with card_token, customer, merchant_initiated,
 * payment_type and the same agreement_id. Docs: /docs/recurring-payments.
 */
export function MitCheckout({ intentBody, session, api }: FlowCheckoutProps & { api: BackendApi }) {
  const router = useRouter();
  const customerId = useConfig(c => c.customerIds[accountKey(session)] ?? '');
  const agreementKey = `${accountKey(session)}:${customerId}`;
  const savedAgreement = useConfig(c => c.agreementIds[agreementKey] ?? '');
  const [cards, setCards] = useState<CustomerCard[] | null>(null);
  const [selected, setSelected] = useState('');
  const [agreementId, setAgreementId] = useState(savedAgreement);
  const [agreement, setAgreement] = useState<{ checked: string; active: string[]; expired: string[]; found: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  async function checkAgreement(id: string) {
    if (!id.trim()) return;
    setBusy('agreement');
    setError(null);
    try {
      const res = await getAgreement(session, id.trim());
      const mappings = ((obj(obj(res.data).data).provider_mappings ?? obj(res.data).provider_mappings) as unknown[] | undefined) ?? [];
      const by = (status: string) =>
        mappings.map(m => obj(m)).filter(m => String(m.status).toLowerCase() === status).map(m => String(m.provider_name ?? 'provider'));
      setAgreement({ checked: id.trim(), found: res.found, active: by('active'), expired: by('expired') });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!customerId || loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        setCards(await listCustomerCards(session, customerId));
      } catch (e) {
        setError(errorText(e));
        setCards([]);
      }
      if (savedAgreement) await checkAgreement(savedAgreement);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  /** Sets up the customer-present payment (CIT) that makes the card usable for MIT. */
  function prepareCit() {
    const id = agreementId.trim() || `agr_${crypto.randomUUID()}`;
    const cfg = useConfig.getState();
    cfg.set({
      agreementIds: { ...cfg.agreementIds, [agreementKey]: id },
      intentPatch: {
        set: {
          ...cfg.intentPatch.set,
          merchant_initiated: false,
          tokenize_card: true,
          payment_type: 'UNSCHEDULED',
          recurring_data: { agreement_id: id },
        },
        removed: cfg.intentPatch.removed.filter(k => !['merchant_initiated', 'tokenize_card', 'payment_type', 'recurring_data'].includes(k)),
      },
      selection: { ...cfg.selection, experience: 'checkout' },
    });
    router.push('/checkout');
  }

  const card = cards?.find(c => c.id === selected);
  const expired = (c: CustomerCard) => {
    const m = Number(c.expiry_month);
    const y = Number(c.expiry_year);
    if (!m || !y) return false;
    const now = new Date();
    const year = y < 100 ? 2000 + y : y;
    return year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth() + 1);
  };
  const blocker = !card
    ? 'Pick a saved card.'
    : expired(card)
      ? 'This card has expired.'
      : !agreementId.trim()
        ? 'Enter the agreement ID from the customer-present payment that saved this card.'
        : !agreement || agreement.checked !== agreementId.trim()
          ? 'Check the agreement first.'
          : !agreement.found
            ? 'MoneyHash has no agreement with this ID: make a customer-present payment with it first.'
            : !agreement.active.length
              ? 'The agreement is not active for any provider (expired or never confirmed): run a new customer-present payment.'
              : null;

  async function charge() {
    if (!card || blocker) return;
    setBusy('charge');
    setError(null);
    try {
      // Re-check the card is still on the customer (it may have been deleted since).
      const fresh = await listCustomerCards(session, customerId);
      if (!fresh.some(c => c.id === card.id)) throw new Error('This card is no longer saved on the customer.');
      const body: Record<string, unknown> = {
        ...intentBody,
        customer: customerId,
        card_token: card.id,
        merchant_initiated: true,
        payment_type: 'UNSCHEDULED',
        recurring_data: { agreement_id: agreementId.trim() },
      };
      delete body.tokenize_card;
      delete body.allow_tokenize_card;
      const res = api === 'payment' ? await createPaymentIntent(session, body) : await serverIntentCall(session, api, 'create', { body });
      const data = obj(res.data);
      const id = (obj(data.intent).id ?? data.id) as string | undefined;
      if (!id) throw new Error('MoneyHash did not return an intent id. See the console.');
      // The outcome arrives by webhook; the order page waits for it.
      router.push(orderUrl(id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (!customerId) {
    return <p className="text-sm text-subtle">Pick or create a test customer under Saved cards on the details page: cards on file belong to a customer.</p>;
  }
  if (!cards) {
    return (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> Loading the customer&apos;s saved cards…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-subtle">No customer on the page: your backend charges a card on file, e.g. a subscription renewal or a top-up.</p>

      <div>
        <p className="text-sm text-bolder">Card on file</p>
        <p className="text-xs text-subtle">All cards saved on the customer (GET /customers/{'{id}'}/cards/).</p>
        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">This customer has no saved cards yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-input rounded-md border border-input">
            {cards.map(c => (
              <label key={c.id} className={cn('flex cursor-pointer items-center gap-4 p-4', expired(c) && 'cursor-not-allowed opacity-60')}>
                <input
                  type="radio"
                  name="mh-mit-card"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selected === c.id}
                  disabled={expired(c)}
                  onChange={() => setSelected(c.id)}
                />
                <CreditCard className="size-5 text-subtler" />
                <span className="flex-1 text-sm capitalize text-bolder">
                  {c.brand ?? 'Card'} •••• {c.last_4 ?? '????'}
                </span>
                <span className="text-sm text-subtle">
                  {expired(c) ? 'Expired' : c.expiry_month && c.expiry_year ? `${c.expiry_month}/${c.expiry_year}` : ''}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm text-bolder">Agreement</p>
        <p className="text-xs text-subtle">
          Set up by a customer-present payment with payment_type UNSCHEDULED and recurring_data.agreement_id; MIT reuses the same ID.
        </p>
        <div className="mt-2 flex gap-2">
          <Input label="Agreement ID" value={agreementId} onChange={e => setAgreementId(e.target.value)} containerClassName="flex-1" />
          <Button variant="outline" className="h-10" disabled={!agreementId.trim() || busy === 'agreement'} onClick={() => checkAgreement(agreementId)}>
            {busy === 'agreement' && <Loader2 className="size-4 animate-spin" />}
            Check
          </Button>
        </div>
        {agreement && agreement.checked === agreementId.trim() && (
          <p className="mt-2 text-xs text-subtle">
            {!agreement.found
              ? 'No agreement with this ID yet.'
              : agreement.active.length
                ? `Active for ${agreement.active.join(', ')}.`
                : `Not active${agreement.expired.length ? ` (expired for ${agreement.expired.join(', ')})` : ''}.`}
          </p>
        )}
        <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={prepareCit}>
          No agreement yet? Set up the customer-present payment that saves a card for MIT
        </button>
      </div>

      <div>
        <Button className="w-full" disabled={!!blocker || !!busy} onClick={charge}>
          {busy === 'charge' && <Loader2 className="size-4 animate-spin" />}
          Charge the card on file
        </Button>
        {blocker && <p className="mt-2 text-xs text-subtle">{blocker}</p>}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

/** MoneyHash's hosted page for an intent your server created with the External or Direct API. */
export function ServerHosted({ intentBody, session, api, mode }: FlowCheckoutProps & { api: ServerApi; mode: 'iframe' | 'redirect' }) {
  const [url, setUrl] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useWebhookRedirect(mode === 'iframe' ? intentId : null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await serverIntentCall(session, api, 'create', { body: intentBody });
        const intent = obj(obj(res.data).intent);
        const id = typeof intent.id === 'string' ? intent.id : '';
        if (!id) throw new Error('MoneyHash did not return an intent id. See the console.');
        const embed = embedUrlFor(session, { id, intent_secret: typeof intent.intent_secret === 'string' ? intent.intent_secret : undefined });
        if (mode === 'redirect') {
          // A short pause so the console shows the call before the page changes.
          setTimeout(() => (window.location.href = embed), 1200);
        }
        setIntentId(id);
        setUrl(embed);
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [api, intentBody, session, mode]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!url || mode === 'redirect') {
    return (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="size-4 animate-spin" /> {url ? 'Sending you to MoneyHash’s page…' : 'Your server is creating the intent…'}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <WebhookWatcher intentId={intentId} />
      <iframe src={url} title="MoneyHash checkout" allow="payment *" className="h-[700px] w-full rounded-md border bg-background" />
      <p className="text-xs text-subtle">When MoneyHash sends the final webhook, your backend updates the order and this page moves on by itself.</p>
    </div>
  );
}
