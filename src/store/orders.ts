'use client';
// Snapshot of what was bought, taken when the intent is created, so the order
// page can show it after the cart is cleared. Tab-scoped like the console.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Currency } from '@/lib/catalog';
import type { Customer } from './config';
import { cartLines, cartTotal, useCart } from './cart';
import { useConfig } from './config';

export type OrderSnapshot = {
  currency: Currency;
  total: number;
  customer: Customer;
  items: {
    id: string;
    name: string;
    color: string;
    description: string;
    imageSrc: string;
    imageAlt: string;
    quantity: number;
    lineTotal: number;
  }[];
};

type OrdersState = {
  snapshots: Record<string, OrderSnapshot>;
  snapshot: (intentId: string) => void;
};

export const useOrders = create<OrdersState>()(
  persist(
    set => ({
      snapshots: {},
      snapshot: intentId => {
        const { quantities, currency } = useCart.getState();
        const lines = cartLines(quantities, currency);
        const snap: OrderSnapshot = {
          currency,
          total: cartTotal(lines, currency),
          customer: useConfig.getState().customer,
          items: lines.map(l => ({
            id: l.product.id,
            name: l.product.name,
            color: l.product.color,
            description: l.product.description,
            imageSrc: l.product.imageSrc,
            imageAlt: l.product.imageAlt,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        };
        set(s => ({ snapshots: { ...s.snapshots, [intentId]: snap } }));
      },
    }),
    {
      name: 'mh-playground-orders',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
