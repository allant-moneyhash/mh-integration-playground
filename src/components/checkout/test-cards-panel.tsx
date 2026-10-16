'use client';
import { useState } from 'react';
import { ChevronUp, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { testCards, threeDsSimulatorCards, type Currency } from '@/lib/catalog';
import { cn } from '@/lib/cn';

export function TestCardsPanel({ currency }: { currency: Currency }) {
  const [open, setOpen] = useState(false);
  const set = testCards[currency];
  const copy = (n: string) => {
    navigator.clipboard.writeText(n);
    toast.success('Card number copied');
  };
  const cards = [
    { label: 'Success', number: set.frictionless, tone: 'text-green-600' },
    {
      label: 'Authentication (3DS)',
      number: set.challenge,
      tone: 'text-indigo-600',
    },
    ...(set.failed
      ? [{ label: 'Decline', number: set.failed, tone: 'text-red-600' }]
      : []),
  ];

  return (
    <div className="fixed bottom-0 right-5 z-20 w-80 max-w-[calc(100vw-2.5rem)] rounded-t-md border bg-background shadow-lg">
      <button
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold tracking-wide"
        onClick={() => setOpen(o => !o)}
      >
        TEST CARDS
        <ChevronUp
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto border-t p-4 text-sm">
          <p className="text-xs text-subtle">
            {set.providerName} test cards for {currency}. They work when{' '}
            {currency} routes to {set.providerName} on your account.{' '}
            <a
              href={set.docsLink}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Provider docs
            </a>
          </p>
          {cards.map(c => (
            <CardButton key={c.label} {...c} onCopy={copy} />
          ))}
          <p className="text-xs text-subtle">
            {set.note ?? 'Any future expiry and any 3-digit CVV.'}
          </p>
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium">MoneyHash 3DS simulator</p>
            {threeDsSimulatorCards.map(c => (
              <CardButton
                key={c.number}
                label={c.label}
                number={c.number}
                tone="text-subtle"
                onCopy={copy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardButton({
  label,
  number,
  tone,
  onCopy,
}: {
  label: string;
  number: string;
  tone: string;
  onCopy: (n: string) => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 text-left hover:bg-muted"
      onClick={() => onCopy(number)}
    >
      <span>
        <span className={cn('block text-xs font-medium', tone)}>{label}</span>
        <span className="font-mono text-sm">
          {number.replace(/(\d{4})(?=\d)/g, '$1 ')}
        </span>
      </span>
      <Copy className="size-4 text-subtler" />
    </button>
  );
}
