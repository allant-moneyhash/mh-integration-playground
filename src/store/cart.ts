'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { products, type Currency, type Product, CURRENCY_DECIMALS } from '@/lib/catalog';

type CartState = {
  currency: Currency;
  quantities: Record<string, number>;
  setCurrency: (c: Currency) => void;
  add: (id: string) => void;
  setQuantity: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    set => ({
      currency: 'AED',
      quantities: {},
      setCurrency: currency => set({ currency }),
      add: id => set(s => ({ quantities: { ...s.quantities, [id]: (s.quantities[id] ?? 0) + 1 } })),
      setQuantity: (id, qty) =>
        set(s => {
          const next = { ...s.quantities };
          if (qty <= 0) delete next[id];
          else next[id] = qty;
          return { quantities: next };
        }),
      remove: id =>
        set(s => {
          const next = { ...s.quantities };
          delete next[id];
          return { quantities: next };
        }),
      clear: () => set({ quantities: {} }),
    }),
    { name: 'mh-playground-cart' },
  ),
);

export type CartLine = { product: Product; quantity: number; lineTotal: number };

export function cartLines(quantities: Record<string, number>, currency: Currency): CartLine[] {
  return products
    .filter(p => quantities[p.id])
    .map(p => ({ product: p, quantity: quantities[p.id], lineTotal: p.price[currency] * quantities[p.id] }));
}

export function cartTotal(lines: CartLine[], currency: Currency) {
  const d = CURRENCY_DECIMALS[currency];
  return Number(lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(d));
}
