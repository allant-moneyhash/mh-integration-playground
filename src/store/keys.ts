'use client';
// Keys typed in Config. Kept for this tab only (sessionStorage) so they survive
// the redirect to MoneyHash and back, and are gone when the tab closes.
// Empty = the server uses the demo account keys from its env vars.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type KeysState = {
  apiKey: string;
  publicApiKey: string;
  setKeys: (k: Partial<Pick<KeysState, 'apiKey' | 'publicApiKey'>>) => void;
  clearKeys: () => void;
};

export const useKeys = create<KeysState>()(
  persist(
    set => ({
      apiKey: '',
      publicApiKey: '',
      setKeys: k => set(k),
      clearKeys: () => set({ apiKey: '', publicApiKey: '' }),
    }),
    {
      name: 'mh-playground-keys',
      storage: createJSONStorage(() => sessionStorage),
      partialize: s => ({ apiKey: s.apiKey, publicApiKey: s.publicApiKey }),
    },
  ),
);
