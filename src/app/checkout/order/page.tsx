import { Suspense } from 'react';
import { OrderView } from '@/components/checkout/order-view';

export default function OrderPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto h-96 max-w-7xl animate-pulse px-4" />}
    >
      <OrderView />
    </Suspense>
  );
}
