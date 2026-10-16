'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_API_VERSION, type ApiVersion, type EnvId } from '@/lib/hosts';
import type { IntentPatch } from '@/lib/intent-body';
import {
  DEFAULT_SELECTION,
  fromLegacyFlowId,
  normalise,
  type Selection,
} from '@/flows/selection';

export type Customer = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address: string;
  /** MoneyHash billing/shipping fields beyond the address line (some providers require street). */
  street: string;
  building: string;
  floor: string;
  apartment: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

export const DEFAULT_CUSTOMER: Customer = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone_number: '+966500000000',
  address: 'King Fahd Road',
  street: 'King Fahd Road',
  building: '12',
  floor: '1',
  apartment: '4',
  city: 'Riyadh',
  state: 'Riyadh',
  postal_code: '12271',
  country: 'SA',
};

export type EmbedOptionValues = Record<string, string | boolean>;

export type ConfigState = {
  env: EnvId;
  apiVersion: ApiVersion;
  useIntentSecret: boolean;
  /** Backend API, checkout experience and its settings. */
  selection: Selection;
  embedOptions: EmbedOptionValues;
  customer: Customer;
  /** Hand edits made in the JSON preview, applied on top of the generated body. */
  intentPatch: IntentPatch;
  /** Console "Edit and resend" on SDK calls: fields merged into that method's options object on every call. */
  sdkEdits: Record<string, IntentPatch>;
  /** Live console panel shown or hidden. */
  showConsole: boolean;
  /** Card form look for the SDK flows (as in the shop's config bar). */
  cardFormLayout: 'compact' | 'expanded';
  /** MoneyHash customer used by the saved-card flow, per environment. */
  /** MoneyHash customer per account ("env:keyFingerprint", see accountKey); customers belong to one account. */
  customerIds: Record<string, string>;
  /** Recurring/unscheduled agreement per customer ("env:customerId"), set by a customer-present payment, reused for MIT. */
  agreementIds: Record<string, string>;
  /** Optional MoneyHash flow (dashboard Flows); sent as flow_id, which then decides the operation and routing. */
  paymentFlowId: string;
  set: (partial: Partial<Omit<ConfigState, 'set' | 'setEmbedOption'>>) => void;
  setEmbedOption: (key: string, value: string | boolean) => void;
};

export const useConfig = create<ConfigState>()(
  persist(
    set => ({
      env: 'staging',
      apiVersion: DEFAULT_API_VERSION,
      useIntentSecret: true,
      selection: DEFAULT_SELECTION,
      embedOptions: {},
      customer: DEFAULT_CUSTOMER,
      intentPatch: { set: {}, removed: [] },
      sdkEdits: {},
      showConsole: true,
      cardFormLayout: 'compact',
      customerIds: {},
      agreementIds: {},
      paymentFlowId: '',
      set: partial => set(partial),
      setEmbedOption: (key, value) =>
        set(s => {
          // A toggle change wins over an older hand edit of the same field.
          const patchSet = { ...s.intentPatch.set };
          delete patchSet[key];
          return {
            embedOptions: { ...s.embedOptions, [key]: value },
            intentPatch: {
              set: patchSet,
              removed: s.intentPatch.removed.filter(k => k !== key),
            },
          };
        }),
    }),
    {
      name: 'mh-playground-config',
      version: 2,
      // v1 stored a flowId; map it to the API + experience + settings it meant.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { flowId, ...rest } = old;
          return {
            ...rest,
            selection: fromLegacyFlowId(
              typeof flowId === 'string' ? flowId : '',
            ),
          };
        }
        return {
          ...old,
          selection: normalise(
            (old.selection as Selection) ?? DEFAULT_SELECTION,
          ),
        };
      },
      // Details saved by older versions miss newer fields (street, building…): fill them in.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ConfigState>;
        const c = { ...DEFAULT_CUSTOMER, ...(p.customer ?? {}) };
        return {
          ...current,
          ...p,
          customer: {
            ...c,
            street: c.street || c.address,
            building: c.building || '12',
            floor: c.floor || '1',
            apartment: c.apartment || '4',
          },
        };
      },
      partialize: s => ({
        env: s.env,
        apiVersion: s.apiVersion,
        useIntentSecret: s.useIntentSecret,
        selection: s.selection,
        embedOptions: s.embedOptions,
        customer: s.customer,
        intentPatch: s.intentPatch,
        sdkEdits: s.sdkEdits,
        showConsole: s.showConsole,
        cardFormLayout: s.cardFormLayout,
        customerIds: s.customerIds,
        agreementIds: s.agreementIds,
        paymentFlowId: s.paymentFlowId,
      }),
    },
  ),
);
