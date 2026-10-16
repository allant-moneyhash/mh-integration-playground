'use client';
// Saved cards, as in shop.moneyhash.io:
// pick a card, enter its CVV (always — requiresCvv can be false while the
// provider still requires it), pay. Optional delete.
import { useState } from 'react';
import { CreditCard, Loader2, Trash2 } from 'lucide-react';
import type { Card } from '@moneyhash/js-sdk/headless';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { errorText } from './card-form';

export function SavedCards({
  cards,
  payLabel,
  onPay,
  onDelete,
  disabled = false,
  selectedId,
  onSelect,
}: {
  cards: Card[];
  payLabel: (card: Card) => string;
  onPay: (card: Card, cvv: string) => Promise<void>;
  onDelete?: (card: Card) => Promise<void>;
  disabled?: boolean;
  /** Controlled by the checkout, so a saved card and a payment method are never open together. */
  selectedId: string | null;
  onSelect: (cardId: string) => void;
}) {
  const selected = selectedId ?? '';
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = cards.find(c => c.id === selected);

  async function act(label: string, fn: () => Promise<void>) {
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

  return (
    <div className="space-y-3">
      <div className="divide-y divide-input rounded-md border border-input">
        {cards.map(c => (
          <label key={c.id} className="flex cursor-pointer items-center gap-4 p-4">
            <input
              type="radio"
              name="mh-saved-card"
              className="size-4 accent-[hsl(var(--primary))]"
              checked={selected === c.id}
              disabled={disabled || !!busy}
              onChange={() => {
                onSelect(c.id);
                setCvv('');
              }}
            />
            {c.logo ? (
              // Card brand logo from MoneyHash.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logo} alt={c.brand} className="h-6 w-[34px] object-contain" />
            ) : (
              <CreditCard className="size-6 text-subtler" />
            )}
            <span className="flex-1 text-sm text-bolder">
              <span className="capitalize">{c.brand}</span> •••• {c.last4}
            </span>
            <span className="text-sm text-subtle">
              {c.expiryMonth}/{c.expiryYear}
            </span>
            {onDelete && (
              <button
                type="button"
                aria-label="Delete card"
                className="rounded p-1 text-subtler hover:bg-muted hover:text-destructive disabled:opacity-50"
                disabled={disabled || !!busy}
                onClick={e => {
                  e.preventDefault();
                  act(`delete-${c.id}`, () => onDelete(c));
                }}
              >
                {busy === `delete-${c.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            )}
          </label>
        ))}
      </div>
      {card && (
        <div className="flex items-start gap-3">
          <Input label="CVV" inputMode="numeric" maxLength={4} value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, ''))} containerClassName="w-32" />
          <Button className={cn('h-10 flex-1')} disabled={disabled || !!busy || cvv.length < 3} onClick={() => act('pay', () => onPay(card, cvv))}>
            {busy === 'pay' && <Loader2 className="size-4 animate-spin" />}
            {payLabel(card)}
          </Button>
        </div>
      )}
      <p className="text-xs text-subtle">MoneyHash lists only the saved cards usable for this payment (same provider connection, currency and flow), so a customer may have more.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
