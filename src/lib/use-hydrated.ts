'use client';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** True after hydration. Gate UI that reads browser storage to avoid mismatches. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
