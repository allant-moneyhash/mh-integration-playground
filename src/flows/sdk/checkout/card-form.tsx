'use client';
// Card form in the style of shop.moneyhash.io: MoneyHash vault
// fields with floating labels, compact or expanded layout, brand icon,
// auto-advance between fields, and the billing fields MoneyHash asks for.
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  ElementStyles,
  ElementType,
  Field,
} from '@moneyhash/js-sdk/headless';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FloatingSelect,
  PhoneInput,
} from '@/components/checkout/customer-fields';
import { COUNTRIES } from '@/lib/countries';
import { phoneProblem } from '@/lib/country-defaults';
import { useConfig } from '@/store/config';
import { cn } from '@/lib/cn';
import type { Sdk } from '../runtime';

type Elements = ReturnType<Sdk['elements']>;
type FieldHandle = ReturnType<Elements['create']>;

const ElementsContext = createContext<Elements | null>(null);

function cssColor(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v ? `hsl(${v})` : fallback;
}

function ElementsProvider({
  sdk,
  onValidityChange,
  children,
}: {
  sdk: Sdk;
  onValidityChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [elements] = useState(() =>
    sdk.elements({
      styles: {
        color: {
          base: cssColor('--foreground', '#2b3252'),
          error: cssColor('--destructive', '#ef4444'),
        },
        placeholderColor: cssColor('--text-subtler', '#9ca3af'),
        height: '40px',
        padding: '0.25rem 0.75rem',
        fontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif',
      },
      fontSourceCss:
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap',
      // The SDK adds these to every field container. Keep them unstyled: the
      // visible border/focus ring is drawn once on our wrapper (as in the shop),
      // otherwise inner month/year/CVV boxes get their own borders.
      classes: { focus: 'mh-el-focus', error: 'mh-el-error' },
    }),
  );
  const cb = useRef(onValidityChange);
  useEffect(() => {
    cb.current = onValidityChange;
  });
  useEffect(() => {
    elements.on('validityChange', (v: boolean) => cb.current(v));
  }, [elements]);
  return (
    <ElementsContext.Provider value={elements}>
      {children}
    </ElementsContext.Provider>
  );
}

function useElements() {
  const e = useContext(ElementsContext);
  if (!e) throw new Error('Card fields must be inside ElementsProvider');
  return e;
}

type FieldEvents = {
  onComplete?: () => void;
  onBackspace?: () => void;
  onBrand?: (b: { brand: string; brandIconUrl: string }) => void;
};

function useMoneyHashField(
  type: ElementType,
  opts: FieldEvents & { styles?: ElementStyles; placeholder?: string } = {},
) {
  const elements = useElements();
  const [state, setState] = useState({
    mounted: false,
    focused: false,
    error: false,
    valid: false,
    length: 0,
  });
  const [field] = useState<FieldHandle>(() =>
    elements.create({
      elementType: type,
      elementOptions: {
        selector: `#mh-${type}`,
        placeholder: opts.placeholder ?? ' ',
        styles: opts.styles,
        ...(type === 'cardHolderName'
          ? { validation: { required: true } }
          : {}),
        ...(type === 'cardNumber' ? { validation: { cardNumber: true } } : {}),
      },
    } as Parameters<Elements['create']>[0]),
  );
  const ev = useRef(opts);
  useEffect(() => {
    ev.current = opts;
  });

  useEffect(() => {
    field.on('mount', () => setState(s => ({ ...s, mounted: true })));
    field.on('focus', () => setState(s => ({ ...s, focused: true })));
    field.on('blur', () => setState(s => ({ ...s, focused: false })));
    field.on('error', ({ isValid }: { isValid: boolean }) =>
      setState(s => ({ ...s, error: !isValid })),
    );
    field.on(
      'changeInput',
      ({ length, isValid }: { length: number; isValid: boolean }) => {
        setState(s => ({ ...s, length, valid: isValid }));
        if (isValid) ev.current.onComplete?.();
      },
    );
    field.on('key:Backspace', () => ev.current.onBackspace?.());
    if (type === 'cardNumber')
      field.on(
        'cardNumberChange',
        (d: { brand: string; brandIconUrl: string }) => ev.current.onBrand?.(d),
      );
    field.mount();
    return () => {
      for (const e of [
        'mount',
        'focus',
        'blur',
        'error',
        'changeInput',
        'key:Backspace',
        'cardNumberChange',
      ] as const)
        field.off(e);
    };
  }, [field, type]);

  return { field, ...state, hasValue: state.length > 0 };
}

function FloatingLabel({
  label,
  active,
  focused,
  error,
}: {
  label: string;
  active: boolean;
  focused: boolean;
  error: boolean;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute start-1 top-1/2 z-10 origin-left -translate-y-1/2 bg-background px-2 text-sm text-subtle transition-all duration-150',
        active && 'top-2 -translate-y-4 scale-75',
        focused && !error && 'text-ring',
        error && 'text-red-500',
      )}
    >
      {label}
    </span>
  );
}

const MoneyHashFormField = forwardRef<
  Pick<FieldHandle, 'focus' | 'blur' | 'clear'>,
  { type: ElementType; label: string; onComplete?: () => void }
>(({ type, label, onComplete }, ref) => {
  const f = useMoneyHashField(type, { onComplete });
  useImperativeHandle(
    ref,
    () => ({ focus: f.field.focus, blur: f.field.blur, clear: f.field.clear }),
    [f.field],
  );
  return (
    <div className="relative">
      {!f.mounted && (
        <div className="absolute inset-0 animate-pulse rounded-sm bg-muted/40" />
      )}
      <div
        id={`mh-${type}`}
        className={cn(
          'h-10 rounded-sm border border-input',
          f.focused && 'MoneyHashElement--focus',
          f.error && 'MoneyHashElement--error',
        )}
      />
      <FloatingLabel
        label={label}
        active={f.focused || f.hasValue}
        focused={f.focused}
        error={f.error}
      />
    </div>
  );
});
MoneyHashFormField.displayName = 'MoneyHashFormField';

function ExpiryField({ onComplete }: { onComplete: () => void }) {
  const year = useRef<FieldHandle | null>(null);
  const month = useMoneyHashField('cardExpiryMonth', {
    styles: { padding: '0px 5px 0px 10px' },
    onComplete: () => year.current?.focus(),
  });
  const y = useMoneyHashField('cardExpiryYear', {
    styles: { padding: '0px 10px' },
    onComplete,
    onBackspace: () => {
      if (y.length === 0) {
        month.field.clear();
        month.field.focus();
      }
    },
  });
  useEffect(() => {
    year.current = y.field;
  }, [y.field]);
  const focused = month.focused || y.focused;
  const error = month.error || y.error;
  return (
    <div className="relative">
      {!(month.mounted && y.mounted) && (
        <div className="absolute inset-0 animate-pulse rounded-sm bg-muted/40" />
      )}
      <div
        className={cn(
          'flex h-10 items-center rounded-sm border border-input',
          focused && 'MoneyHashElement--focus',
          error && 'MoneyHashElement--error',
        )}
      >
        <div
          id="mh-cardExpiryMonth"
          className={cn('h-full w-12', !month.valid && 'w-full')}
        />
        <span className={cn('text-sm', month.valid ? 'block' : 'hidden')}>
          /
        </span>
        <div
          id="mh-cardExpiryYear"
          className={cn('h-full', month.valid ? 'w-full' : 'w-0')}
        />
      </div>
      <FloatingLabel
        label="Expiry"
        active={focused || month.hasValue || y.hasValue}
        focused={focused}
        error={error}
      />
    </div>
  );
}

function ExpandedCardForm() {
  const cvv = useRef<Pick<FieldHandle, 'focus' | 'blur' | 'clear'> | null>(
    null,
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-full">
        <MoneyHashFormField type="cardNumber" label="Card number" />
      </div>
      <ExpiryField onComplete={() => cvv.current?.focus()} />
      <MoneyHashFormField ref={cvv} type="cardCvv" label="CVV" />
      <div className="col-span-full">
        <MoneyHashFormField type="cardHolderName" label="Name on card" />
      </div>
    </div>
  );
}

function CompactCardForm() {
  const [brand, setBrand] = useState<{
    brand: string;
    brandIconUrl: string;
  } | null>(null);
  const refs = useRef<{
    month?: FieldHandle;
    year?: FieldHandle;
    cvv?: FieldHandle;
    number?: FieldHandle;
  }>({});
  const number = useMoneyHashField('cardNumber', {
    placeholder: 'Card number',
    styles: {
      padding: '0px 5px 0px 40px',
      textAlign: 'left',
      direction: 'ltr',
    },
    onBrand: setBrand,
    onComplete: () => refs.current.month?.focus(),
  });
  const month = useMoneyHashField('cardExpiryMonth', {
    placeholder: 'MM',
    styles: { padding: '0px 5px' },
    onComplete: () => refs.current.year?.focus(),
    onBackspace: () => month.length === 0 && refs.current.number?.focus(),
  });
  const year = useMoneyHashField('cardExpiryYear', {
    placeholder: 'YY',
    styles: { padding: '0px 5px', direction: 'ltr' },
    onComplete: () => refs.current.cvv?.focus(),
    onBackspace: () => year.length === 0 && refs.current.month?.focus(),
  });
  const cvv = useMoneyHashField('cardCvv', {
    placeholder: 'CVV',
    styles: { padding: '0px 0px 0px 10px', direction: 'ltr' },
    onBackspace: () => cvv.length === 0 && refs.current.year?.focus(),
  });
  useEffect(() => {
    refs.current = {
      number: number.field,
      month: month.field,
      year: year.field,
      cvv: cvv.field,
    };
  }, [number.field, month.field, year.field, cvv.field]);
  const focused =
    number.focused || month.focused || year.focused || cvv.focused;
  const mounted =
    number.mounted && month.mounted && year.mounted && cvv.mounted;

  return (
    <div className="space-y-4">
      <div className="relative">
        {!mounted && (
          <div className="absolute inset-0 animate-pulse rounded-sm bg-muted/40" />
        )}
        <div
          className={cn(
            'grid h-10 grid-cols-11 rounded-sm border border-input sm:grid-cols-10',
            focused && 'MoneyHashElement--focus',
          )}
        >
          <div className="relative col-span-6 sm:col-span-7">
            <div id="mh-cardNumber" className="h-full" />
            <div className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2">
              {!brand || brand.brand === 'Unknown' ? (
                <CreditCard className="size-6 text-subtler" />
              ) : (
                // Brand icon URL comes from MoneyHash.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="size-6"
                  src={brand.brandIconUrl}
                  alt={brand.brand}
                />
              )}
            </div>
          </div>
          <div className="col-span-5 grid grid-cols-2 sm:col-span-3">
            <div className="flex items-center *:shrink-0">
              <div id="mh-cardExpiryMonth" className="h-full basis-[38px]" />
              <span
                className={cn(
                  'text-sm',
                  month.valid ? 'text-inherit' : 'text-subtler',
                )}
              >
                /
              </span>
              <div id="mh-cardExpiryYear" className="h-full basis-[38px]" />
            </div>
            <div id="mh-cardCvv" className="h-full" />
          </div>
        </div>
      </div>
      <MoneyHashFormField type="cardHolderName" label="Name on card" />
    </div>
  );
}

/** Fields MoneyHash asks for in FORM_FIELDS (state_details.formFields.billing / shipping). */
export function BillingFields({
  fields,
  values,
  onChange,
  title = 'Billing details',
}: {
  fields: Field[];
  values: Record<string, string>;
  onChange: (n: string, v: string) => void;
  title?: string;
}) {
  // Fields already filled (from the checkout page) stay folded away; only what is
  // missing or invalid is asked for. Their values are still sent.
  const [filled] = useState(
    () =>
      new Set(
        fields.filter(f => fieldOk(f, values[f.name] ?? '')).map(f => f.name),
      ),
  );
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? fields : fields.filter(f => !filled.has(f.name));
  return (
    <div>
      {filled.size > 0 && !showAll && (
        <p className="text-xs text-subtle">
          Using your checkout details for {title.toLowerCase()} ({filled.size}{' '}
          {filled.size === 1 ? 'field' : 'fields'}).{' '}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setShowAll(true)}
          >
            Edit
          </button>
        </p>
      )}
      {shown.length > 0 && (
        <>
          <p className="mt-3 flex items-center gap-3 text-center text-sm before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            {title}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {shown.map(f => {
              // Select options may depend on another field (optionsMap keyed by that field's value).
              const options =
                f.optionsList ??
                (f.dependsOn
                  ? f.optionsMap?.[values[f.dependsOn] ?? '']
                  : undefined);
              const id = `mh-${title.toLowerCase().replace(/\W+/g, '-')}-${f.name}`;
              if (f.type === 'select' && options) {
                return (
                  <FloatingSelect
                    key={f.name}
                    id={id}
                    label={f.label}
                    value={values[f.name] ?? ''}
                    disabled={f.readOnly}
                    options={options.map(o => ({
                      value: o.value,
                      label: titleCase(o.label),
                    }))}
                    onChange={v => onChange(f.name, v)}
                  />
                );
              }
              if (f.type === 'phoneNumber' || /phone|mobile/i.test(f.name)) {
                // International format, as MoneyHash validates it.
                return (
                  <PhoneInput
                    key={f.name}
                    id={id}
                    label={f.label}
                    value={values[f.name] ?? ''}
                    defaultCountry={countryCodeOf(values.country ?? '') || 'AE'}
                    onChange={v => onChange(f.name, v)}
                    // A full row, so long labels such as "Mobile wallet number" fit.
                    className="sm:col-span-2"
                  />
                );
              }
              return (
                <Input
                  key={f.name}
                  label={f.label}
                  type={
                    f.type === 'email'
                      ? 'email'
                      : f.type === 'date'
                        ? 'date'
                        : 'text'
                  }
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={values[f.name] ?? ''}
                  readOnly={f.readOnly}
                  onChange={e => onChange(f.name, e.target.value)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** "UNITED ARAB EMIRATES" → "United Arab Emirates" (MoneyHash sends some option labels in capitals). */
const titleCase = (t: string) =>
  t === t.toUpperCase()
    ? t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : t;

/** An ISO code from a country field value (MoneyHash may use codes or names). */
function countryCodeOf(value: string) {
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return (
    COUNTRIES.find(c => c.name.toLowerCase() === value.toLowerCase())?.code ??
    ''
  );
}

/**
 * Starting values for MoneyHash's billing/shipping fields: what MoneyHash sent,
 * else the details entered on the checkout page (same field names as billing_data).
 * A country select gets the option matching the customer's country code or name.
 */
export function prefillFields(
  fields: Field[] | null | undefined,
  customer: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    (fields ?? []).map(f => {
      const phoneLike =
        f.type === 'phoneNumber' || /phone|mobile/i.test(f.name);
      // MoneyHash field names that differ from the checkout details.
      const alias = phoneLike
        ? 'phone_number'
        : /street/i.test(f.name)
          ? 'street'
          : /address/i.test(f.name)
            ? 'address'
            : /zip|postal/i.test(f.name)
              ? 'postal_code'
              : f.name;
      let v = f.value || customer[f.name] || customer[alias] || '';
      const options = f.optionsList;
      if (options && v && !options.some(o => o.value === v)) {
        const code = countryCodeOf(v);
        const name = COUNTRIES.find(c => c.code === code)?.name.toLowerCase();
        v =
          options.find(
            o =>
              o.value.toUpperCase() === code || o.label.toLowerCase() === name,
          )?.value ?? '';
      }
      return [f.name, v];
    }),
  );
}

/** A value that needs no input from the customer. */
function fieldOk(f: Field, value: string) {
  const v = value.trim();
  if (!v) return false;
  return f.type === 'phoneNumber' || /phone|mobile/i.test(f.name)
    ? !phoneProblem(v)
    : true;
}

export const fieldsComplete = (
  fields: Field[] | null | undefined,
  values: Record<string, string>,
) =>
  (fields ?? []).every(f => {
    const v = (values[f.name] ?? '').trim();
    if (!v) return !f.validation?.required;
    // Phone numbers are checked against the country's numbering plan before MoneyHash sees them.
    return f.type === 'phoneNumber' || /phone|mobile/i.test(f.name)
      ? !phoneProblem(v)
      : true;
  });

export type CardLayout = 'compact' | 'expanded';

/**
 * The card step. `onPay` gets the collected (tokenised) card data and the
 * billing values; the flow decides what to do with them (cardForm.pay).
 */
export function CardForm({
  sdk,
  layout,
  billingFields,
  payLabel,
  onPay,
  offerSaveCard = false,
}: {
  sdk: Sdk;
  layout: CardLayout;
  billingFields?: Field[] | null;
  payLabel: string;
  onPay: (args: {
    billingData?: Record<string, string>;
    saveCard?: boolean;
  }) => Promise<void>;
  /** Show "Save this card" (needs a customer and allow_tokenize_card on the intent). */
  offerSaveCard?: boolean;
}) {
  const [valid, setValid] = useState(false);
  const [saveCard, setSaveCard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customer = useConfig(c => c.customer);
  const [billing, setBilling] = useState<Record<string, string>>(() =>
    prefillFields(billingFields, customer),
  );
  const billingOk = fieldsComplete(billingFields, billing);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onPay({
        billingData: billingFields?.length ? billing : undefined,
        saveCard: offerSaveCard ? saveCard : undefined,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ElementsProvider sdk={sdk} onValidityChange={setValid}>
      <div className="space-y-4 p-4">
        {!!billingFields?.length && (
          <BillingFields
            fields={billingFields}
            values={billing}
            onChange={(n, v) => setBilling(b => ({ ...b, [n]: v }))}
          />
        )}
        {layout === 'compact' ? <CompactCardForm /> : <ExpandedCardForm />}
        {offerSaveCard && (
          <label className="flex items-center gap-2 text-sm text-subtle">
            <input
              type="checkbox"
              className="size-4 accent-[hsl(var(--primary))]"
              checked={saveCard}
              onChange={e => setSaveCard(e.target.checked)}
            />
            Save this card for next time
          </label>
        )}
        <div>
          <Button
            className="w-full"
            onClick={submit}
            disabled={!valid || !billingOk || busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {payLabel}
          </Button>
          {error && (
            <p className="mt-2 text-center text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    </ElementsProvider>
  );
}

/** SDK rejections are often plain objects ({ message } or MoneyHash error shapes). */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    for (const v of [o.message, o.error, o.detail])
      if (typeof v === 'string' && v) return v;
    // Field errors, e.g. { type: 'network', phone_number: 'Enter a valid phone number.' }.
    // "type" is the SDK's error category, not a message.
    const label = (k: string) =>
      k.replace(/[_.]/g, ' ').replace(/^\w/, c => c.toUpperCase());
    const fields = Object.entries(o)
      .filter(([k]) => k !== 'type' && k !== 'status')
      .flatMap(([k, v]) =>
        typeof v === 'string'
          ? [[k, v]]
          : Array.isArray(v)
            ? v.filter(x => typeof x === 'string').map(x => [k, x])
            : [],
      )
      .map(([k, v]) => `${label(k)}: ${v}`);
    if (fields.length) return fields.join(' · ');
  }
  return 'Something went wrong. The console has the full response.';
}
