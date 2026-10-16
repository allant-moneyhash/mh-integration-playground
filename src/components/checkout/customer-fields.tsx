'use client';
// Country and phone pickers for the customer form. They store exactly what the
// intent needs: billing_data.country as ISO alpha-2 ("AE") and phone_number in
// international format ("+971501234567").
import { useState } from 'react';
import { COUNTRIES, PINNED_COUNT, countryByCode, joinPhone, splitPhone } from '@/lib/countries';
import { cn } from '@/lib/cn';
import { phoneProblem } from '@/lib/country-defaults';

const selectClass =
  'peer block h-10 w-full appearance-none rounded-sm border border-input bg-transparent pe-8 ps-3 pt-4 pb-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20';
const floatLabel = 'pointer-events-none absolute start-3 top-1 text-[10px] text-subtle';

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute end-2 top-3 size-4 text-subtle" fill="currentColor">
      <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

function CountryOptions({ dial = false }: { dial?: boolean }) {
  // No flag emoji: Windows renders them as two letters.
  const label = (c: (typeof COUNTRIES)[number]) => `${c.name}${dial ? ` (+${c.dial})` : ''}`;
  return (
    <>
      {COUNTRIES.slice(0, PINNED_COUNT).map(c => (
        <option key={c.code} value={c.code}>
          {label(c)}
        </option>
      ))}
      <option disabled>──────────</option>
      {COUNTRIES.slice(PINNED_COUNT).map(c => (
        <option key={c.code} value={c.code}>
          {label(c)}
        </option>
      ))}
    </>
  );
}

/** A select styled like the floating-label inputs, for fields MoneyHash sends with options. */
export function FloatingSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select id={id} className={selectClass} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {!options.some(o => o.value === value) && <option value="">Select…</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor={id} className={floatLabel}>
        {label}
      </label>
      <Chevron />
    </div>
  );
}

/** Country dropdown; the value is the ISO alpha-2 code sent in billing/shipping data. */
export function CountrySelect({ value, onChange, className }: { value: string; onChange: (code: string) => void; className?: string }) {
  const known = !!countryByCode(value);
  return (
    <div className={cn('relative', className)}>
      <select id="customer-country" className={selectClass} value={known ? value.toUpperCase() : ''} onChange={e => onChange(e.target.value)}>
        {!known && <option value="">{value ? `${value} (not in list)` : 'Select a country'}</option>}
        <CountryOptions />
      </select>
      <label htmlFor="customer-country" className={floatLabel}>
        Country
      </label>
      <Chevron />
    </div>
  );
}

/** Dialling-code dropdown + national number; emits the international (E.164) number. */
export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  className,
  id = 'customer-phone',
  label = 'Phone',
}: {
  value: string;
  onChange: (e164: string) => void;
  id?: string;
  label?: string;
  /** Breaks ties for shared codes (+1, +44, +7) and is used when the number is empty. */
  defaultCountry: string;
  className?: string;
}) {
  // Keep what the user typed (e.g. a leading 0) while the stored value stays E.164.
  const [local, setLocal] = useState(() => {
    const split = splitPhone(value, defaultCountry);
    return { code: split.country?.code ?? countryByCode(defaultCountry)?.code ?? 'AE', national: split.national };
  });
  const country = countryByCode(local.code) ?? COUNTRIES[0];

  // The stored number changed elsewhere (a preset, Config): follow it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== joinPhone(country, local.national)) {
      const split = splitPhone(value, local.code);
      setLocal({ code: split.country?.code ?? local.code, national: split.national });
    }
  }

  function update(code: string, national: string) {
    setLocal({ code, national });
    const next = national.replace(/\D/g, '') ? joinPhone(countryByCode(code) ?? country, national) : '';
    setSeen(next);
    onChange(next);
  }

  // Checked against the country's numbering plan before anything goes to MoneyHash.
  const problem = value ? phoneProblem(value) : null;

  return (
    <div className={className}>
    <div className="flex">
      <div className="relative w-24 shrink-0">
        <select
          id={`${id}-code`}
          aria-label="Phone country code"
          // The closed select hides its long "Country (+code)" text; the code is drawn on top.
          className={cn(selectClass, 'rounded-e-none text-transparent [&_option]:text-foreground')}
          value={country.code}
          onChange={e => update(e.target.value, local.national)}
        >
          <CountryOptions dial />
        </select>
        {/* No background, so the select's border stays visible. */}
        <span className="pointer-events-none absolute start-3 bottom-[5px] text-sm text-foreground">+{country.dial}</span>
        <label htmlFor={`${id}-code`} className={floatLabel}>
          Code
        </label>
        <Chevron />
      </div>
      <div className="relative flex-1">
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder=" "
          aria-invalid={!!problem}
          className={cn(
            'peer -ms-px block h-10 w-full rounded-sm rounded-s-none border border-input bg-transparent px-3 pt-4 pb-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20',
            problem && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          )}
          value={local.national}
          onChange={e => update(local.code, e.target.value.replace(/[^\d\s-]/g, ''))}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute end-3 start-3 top-1 truncate whitespace-nowrap text-[10px] text-subtle transition-all peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-[10px]"
        >
          {label}
        </label>
      </div>
    </div>
      {problem && <p className="mt-1 text-xs text-destructive">{problem}</p>}
    </div>
  );
}
