'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ShoppingBag, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { cartLines, cartTotal, useCart } from '@/store/cart';
import { formatMoney } from '@/lib/catalog';
import { useHydrated } from '@/lib/use-hydrated';

export function CartPopover() {
  const hydrated = useHydrated();
  const { quantities, currency, setQuantity, remove } = useCart();
  const lines = hydrated ? cartLines(quantities, currency) : [];
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  // Close when the page changes (e.g. after clicking Checkout).
  if (pathname !== openedOn) {
    setOpenedOn(pathname);
    if (open) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Shopping bag">
          <ShoppingBag className="size-4" />
          <span className="tabular-nums">{count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        {lines.length === 0 ? (
          <p className="p-6 text-center text-sm text-subtle">Your bag is empty.</p>
        ) : (
          <>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {lines.map(({ product, quantity }) => (
                <li key={product.id} className="flex gap-4 p-4">
                  <Image
                    src={product.imageSrc}
                    alt={product.imageAlt}
                    width={64}
                    height={64}
                    className="size-16 rounded-md border object-cover"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{product.name}</span>
                      <span>{formatMoney(product.price[currency] * quantity, currency)}</span>
                    </div>
                    <p className="text-xs text-subtle">{product.color}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center rounded-md border">
                        <button className="p-1.5" aria-label="Decrease" onClick={() => setQuantity(product.id, quantity - 1)}>
                          <Minus className="size-3" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
                        <button className="p-1.5" aria-label="Increase" onClick={() => setQuantity(product.id, quantity + 1)}>
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => remove(product.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t p-4">
              <div className="flex justify-between text-sm font-medium">
                <span>Subtotal</span>
                <span>{formatMoney(cartTotal(lines, currency), currency)}</span>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link href="/checkout" onClick={() => setOpen(false)}>
                  Checkout
                </Link>
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
