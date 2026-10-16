'use client';
// Step 1 of checkout, laid out like shop.moneyhash.io: details and the integration
// choice on the left, the order summary on the right. Nothing is sent to MoneyHash
// here; "Continue to payment" opens the payment page with the live console.
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { decodePreset } from '@/store/presets';
import { formatMoney } from '@/lib/catalog';
import { DEFAULT_CUSTOMER, useConfig, type Customer } from '@/store/config';
import { DEFAULT_SELECTION } from '@/flows/selection';
import { useConsole } from '@/store/console';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/cn';
import { CustomerPicker } from './customer-picker';
import { CountrySelect, PhoneInput } from './customer-fields';
import { detailsForCountry, phoneProblem } from '@/lib/country-defaults';
import { EmbedOptionsPanel } from './embed-options-panel';
import { IntentEditor } from './intent-editor';
import { IntegrationPicker } from './integration-picker';
import { useCheckoutSetup } from './use-checkout-setup';
import type { CartLine } from '@/store/cart';
import type { Currency } from '@/lib/catalog';

export function CheckoutView() {
  const hydrated = useHydrated();
  if (!hydrated)
    return <div className="mx-auto h-96 max-w-7xl animate-pulse px-4" />;
  return <Details />;
}

function Details() {
  const router = useRouter();
  const {
    cfg,
    lines,
    total,
    currency,
    setCurrency,
    flow,
    session,
    generated,
    final,
  } = useCheckoutSetup();
  const [jsonValid, setJsonValid] = useState(true);

  // Each checkout starts with a clean console; earlier checkouts stay in History.
  useEffect(() => {
    useConsole.getState().endAttempt();
  }, []);

  // A share link (?setup=…) opens a saved setup. It never carries keys.
  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('setup');
    if (!raw) return;
    const data = decodePreset(raw);
    if (data) {
      const { currency: c, ...rest } = data;
      useConfig.getState().set(rest);
      setCurrency(c);
      toast.success(
        `Opened ${url.searchParams.get('name') ?? 'the shared setup'}. Add your own keys in Config if needed.`,
      );
    }
    url.searchParams.delete('setup');
    url.searchParams.delete('name');
    window.history.replaceState(null, '', url.toString());
  }, [setCurrency]);

  if (lines.length === 0) return <EmptyBag />;

  const setCustomer = (patch: Partial<Customer>) =>
    cfg.set({ customer: { ...cfg.customer, ...patch } });
  const phoneError = phoneProblem(cfg.customer.phone_number);
  const canContinue = jsonValid && !phoneError;
  /** Back to the playground's defaults (keys, customer ID and presets are kept). */
  const resetToDefault = () => {
    cfg.set({
      customer: DEFAULT_CUSTOMER,
      selection: DEFAULT_SELECTION,
      intentPatch: { set: {}, removed: [] },
      sdkEdits: {},
      embedOptions: {},
      paymentFlowId: '',
    });
    toast.success('Back to the default setup');
  };

  return (
    <div className="relative">
      {/* Split screen, as in the shop's checkout. */}
      <div
        className="fixed end-0 top-0 hidden h-full w-1/2 bg-accent lg:block"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-x-16 lg:grid-cols-2 lg:px-8 lg:pt-16">
        <OrderSummary lines={lines} total={total} currency={currency} />

        <section className="px-4 py-16 pb-36 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-lg lg:px-0 lg:pb-24 lg:pt-0">
          {/* Actions first, as in the Sandbox. */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={resetToDefault}>
              Reset to default
            </Button>
            <Button
              size="lg"
              disabled={!canContinue}
              onClick={() => router.push('/checkout/pay')}
            >
              Continue to payment
            </Button>
          </div>

          <Divider title="Scenario" />
          {/* A new scenario starts without the console edits made for the previous one. */}
          <IntegrationPicker
            selection={cfg.selection}
            onChange={selection => cfg.set({ selection, sdkEdits: {} })}
          />

          <Divider title="Customer" />
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="First name"
              value={cfg.customer.first_name}
              onChange={e => setCustomer({ first_name: e.target.value })}
            />
            <Input
              label="Last name"
              value={cfg.customer.last_name}
              onChange={e => setCustomer({ last_name: e.target.value })}
            />
            <PhoneInput
              value={cfg.customer.phone_number}
              defaultCountry={cfg.customer.country}
              onChange={phone_number => setCustomer({ phone_number })}
            />
            <Input
              label="Email"
              value={cfg.customer.email}
              onChange={e => setCustomer({ email: e.target.value })}
            />
            <Input
              label="Address"
              value={cfg.customer.address}
              onChange={e => setCustomer({ address: e.target.value })}
              containerClassName="md:col-span-2"
            />
            <Input
              label="Street"
              value={cfg.customer.street ?? ''}
              onChange={e => setCustomer({ street: e.target.value })}
            />
            <Input
              label="Building"
              value={cfg.customer.building ?? ''}
              onChange={e => setCustomer({ building: e.target.value })}
            />
            <Input
              label="Floor"
              value={cfg.customer.floor ?? ''}
              onChange={e => setCustomer({ floor: e.target.value })}
            />
            <Input
              label="Apartment"
              value={cfg.customer.apartment ?? ''}
              onChange={e => setCustomer({ apartment: e.target.value })}
            />
            <Input
              label="City"
              value={cfg.customer.city}
              onChange={e => setCustomer({ city: e.target.value })}
            />
            <Input
              label="State / region"
              value={cfg.customer.state}
              onChange={e => setCustomer({ state: e.target.value })}
            />
            <Input
              label="Postal code"
              value={cfg.customer.postal_code}
              onChange={e => setCustomer({ postal_code: e.target.value })}
            />
            <CountrySelect
              value={cfg.customer.country}
              // A new country brings a matching sample address and phone number.
              onChange={country =>
                setCustomer({ country, ...detailsForCountry(country) })
              }
            />
          </div>
          <p className="mt-2 text-xs text-subtle">
            Sent to MoneyHash as billing and shipping data.
          </p>

          <Divider title="Inputs" />
          <div className="space-y-4">
            <div>
              <Input
                label="Flow ID (optional)"
                value={cfg.paymentFlowId}
                onChange={e => cfg.set({ paymentFlowId: e.target.value })}
              />
              <p className="mt-1 text-xs text-subtle">
                Sent as flow_id. The flow from your dashboard then decides the
                operation and routing, so operation is left out.
              </p>
            </div>
            {cfg.selection.experience !== 'hosted' && (
              <div>
                <p className="mb-2 text-sm text-bolder">Saved cards</p>
                <CustomerPicker session={session} />
              </div>
            )}
            <div className="divide-y divide-input rounded-md border border-input">
              <Disclosure
                title="Intent request"
                hint="The JSON your server sends. Edit any field."
              >
                <IntentEditor
                  generated={generated}
                  final={final}
                  patch={cfg.intentPatch}
                  onPatch={p => cfg.set({ intentPatch: p })}
                  onValidity={setJsonValid}
                />
              </Disclosure>
              <Disclosure
                title="Embed and intent options"
                hint="Flags such as hide headers, language, expiry, redirect strategy."
              >
                <EmbedOptionsPanel usesEmbedUrl={flow.usesEmbedUrl} />
              </Disclosure>
            </div>
            <SdkEditsNotice />
          </div>

          <div className="mt-10">
            {!jsonValid && (
              <p className="mb-3 text-sm text-destructive">
                Fix the intent request JSON before continuing.
              </p>
            )}
            {phoneError && (
              <p className="mb-3 text-sm text-destructive">
                Fix the phone number before continuing.
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={!canContinue}
              onClick={() => router.push('/checkout/pay')}
            >
              Continue to payment
            </Button>
            <p className="mt-3 text-center text-xs text-subtle">
              The payment page shows every call between your store and MoneyHash
              in the live console.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Centred section title between two lines, as in the MoneyHash Sandbox. */
function Divider({ title }: { title: string }) {
  return (
    <p className="mb-4 mt-10 flex items-center gap-3 text-sm text-bolder before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      {title}
    </p>
  );
}

function Disclosure({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span>
          <span className="block text-sm text-bolder">{title}</span>
          <span className="block text-xs text-subtle">{hint}</span>
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-subtle transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** The shop's order summary panel. */
export function OrderSummary({
  lines,
  total,
  currency,
}: {
  lines: CartLine[];
  total: number;
  currency: Currency;
}) {
  return (
    <section className="bg-accent py-12 text-accent-foreground md:px-10 lg:col-start-2 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-lg lg:bg-transparent lg:px-0 lg:pb-24 lg:pt-0">
      <div className="mx-auto max-w-2xl px-4 lg:max-w-none lg:px-0">
        <dl className="flex items-center justify-between border-b pb-6">
          <dt className="text-base">Total</dt>
          <dd className="text-base">{formatMoney(total, currency)}</dd>
        </dl>
        <ul className="divide-y divide-border text-sm font-medium">
          {lines.map(({ product, quantity, lineTotal }) => (
            <li key={product.id} className="flex items-start gap-4 py-6">
              <Image
                src={product.imageSrc}
                alt={product.imageAlt}
                width={80}
                height={80}
                className="size-20 flex-none rounded-md object-cover object-center"
              />
              <div className="flex-auto space-y-1">
                <h3>{product.name}</h3>
                <p className="text-subtle">{product.color}</p>
                <p className="text-subtle">Quantity {quantity}</p>
              </div>
              <p className="flex-none text-base font-medium">
                {formatMoney(lineTotal, currency)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function EmptyBag() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-bolder">Your bag is empty</h1>
      <p className="mt-2 text-subtle">
        Add a product or two, then come back to pay.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/">Continue shopping</Link>
      </Button>
    </div>
  );
}

/** Console "Edit and resend" changes to SDK calls are applied on every call, so they are shown here with a way to drop them. */
function SdkEditsNotice() {
  const edits = useConfig(c => c.sdkEdits);
  const active = Object.entries(edits ?? {})
    .map(([method, p]) => ({
      method,
      fields: [
        ...Object.keys(p.set).map(k => `${k} set`),
        ...p.removed.map(k => `${k} removed`),
      ],
    }))
    .filter(e => e.fields.length);
  if (!active.length) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-input p-4 text-sm">
      <div>
        <p className="text-bolder">Console edits to SDK calls</p>
        {active.map(e => (
          <p key={e.method} className="text-xs text-subtle">
            {e.method}(): {e.fields.join(', ')}
          </p>
        ))}
        <p className="mt-1 text-xs text-subtler">
          Applied on top of this scenario on every call. Changing the scenario
          clears them.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => useConfig.getState().set({ sdkEdits: {} })}
      >
        Clear
      </Button>
    </div>
  );
}
