'use client';
// Bank coupon on the card's BIN, checked before the payment intent exists (any API).
// The bank gives the merchant a coupon code and the BINs it is valid for; the store
// compares the card's first six digits, decides the final amount, and only then
// creates the intent. It is the merchant's own rule: no MoneyHash call is involved.
import { Input } from '@/components/ui/input';
import { newId, useConsole } from '@/store/console';

export type Coupon = { code: string; bins: string; percent: string };

/** Prefilled with the BIN of the 4242 test card so the demo works out of the box. */
export const DEFAULT_COUPON: Coupon = {
  code: 'BANK10',
  bins: '424242',
  percent: '10',
};

export type CouponResult = {
  applied: boolean;
  percent: number;
  reason: string;
} | null;

/** The BINs the bank listed (6 or 8 digits); a card matches on its first six digits. */
const binList = (bins: string) =>
  bins
    .split(/[\s,;]+/)
    .map(b => b.replace(/\D/g, ''))
    .filter(b => b.length >= 6);

/**
 * Applies the coupon to a card's first six digits and logs the check in the console
 * as a store-side step. `source` says where the first six digits came from.
 */
export function checkCoupon(
  coupon: Coupon,
  first6: string,
  source: { who: 'Your store' | 'Your server'; from: string },
): CouponResult {
  const code = coupon.code.trim();
  if (!code) return null;
  const bins = binList(coupon.bins);
  const percent = Math.min(Math.max(Number(coupon.percent) || 0, 0), 100);
  const applied = bins.some(b => b.slice(0, 6) === first6);
  const reason = applied
    ? `BIN ${first6} is on the bank’s list for ${code}.`
    : `BIN ${first6} is not on the bank’s list for ${code}, so the full amount applies.`;
  useConsole.getState().add({
    id: newId(),
    ts: Date.now(),
    source: 'Playground',
    title: `${source.who}: coupon ${code} checked against the bank’s BINs`,
    request: {
      body: { coupon: code, first_six_digits: first6, eligible_bins: bins },
    },
    response: { applied, discount_percent: applied ? percent : 0 },
    ok: true,
    note: `${reason} The merchant’s own rule using ${source.from}; no MoneyHash call. The intent is created next for the final amount and paid with this same card, so the customer can’t swap cards after the check.`,
  });
  return { applied, percent, reason };
}

/** Rounded to 2 decimals. */
export function couponTotal(base: number, result: CouponResult) {
  const discount = result?.applied
    ? Math.round(base * result.percent) / 100
    : 0;
  return { discount, total: Math.round((base - discount) * 100) / 100 };
}

/** The coupon setup, edited before the card is checked. Extra options go in `children`. */
export function CouponPanel({
  coupon,
  onChange,
  hint,
  children,
}: {
  coupon: Coupon;
  onChange: (c: Coupon) => void;
  hint: string;
  children?: React.ReactNode;
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
        {hint} 424242 matches the 4242 test card; any other card pays the full
        amount.
      </p>
      {children}
    </div>
  );
}

/** What the coupon did, shown after the card is checked. */
export function CouponOutcome({
  coupon,
  result,
}: {
  coupon: Coupon;
  result: CouponResult;
}) {
  return (
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
  );
}
