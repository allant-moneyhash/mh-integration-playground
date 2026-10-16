import type { ComponentType } from 'react';
import type { ConsoleSource } from '@/lib/console-types';
import type { IntentBody } from '@/lib/intent-body';
import type { Session } from './session';

/** Step 1: how your server talks to MoneyHash. */
export type BackendApi = 'payment' | 'external' | 'direct';

export const BACKEND_APIS: { id: BackendApi; label: string; summary: string; pci: string }[] = [
  {
    id: 'payment',
    label: 'Payment API',
    summary: 'Your server creates the intent; the frontend (hosted page or JS SDK) does the rest.',
    pci: 'No PCI scope',
  },
  {
    id: 'external',
    label: 'External API',
    summary: 'Your server creates and drives the intent: lists and selects methods, pays saved cards. More control and data on your side.',
    pci: 'No PCI scope',
  },
  {
    id: 'direct',
    label: 'Direct API',
    summary: 'Like External, and your server also sends the raw card details to the MoneyHash vault.',
    pci: 'PCI DSS required',
  },
];

/** Step 2: how the customer pays (grouping inside the frontend choice). */
export type FlowCategory = 'hosted' | 'sdk' | 'own' | 'none';

export const CATEGORY_LABELS: Record<FlowCategory, string> = {
  hosted: 'MoneyHash-hosted',
  sdk: 'JavaScript SDK',
  own: 'Your own UI (card form or wallet buttons)',
  none: 'No customer on the page',
};

/** One call the flow will make, shown before paying so the audience knows what to expect. */
export type FlowStep = {
  source: ConsoleSource;
  label: string;
  /** How the intent secret is involved in this step, given the current session. */
  secret?: string;
};

export type FlowCheckoutProps = {
  /** The final intent request (generated + hand edits). */
  intentBody: IntentBody;
  session: Session;
};

export interface IntegrationFlow {
  id: string;
  /** Which backend API this frontend belongs to (step 1). */
  api: BackendApi;
  category: FlowCategory;
  label: string;
  /** One plain sentence for the selector. */
  summary: string;
  /** False = shown as "coming soon" in the selector. */
  ready: boolean;
  /** Whether the flow loads MoneyHash's embed URL (so embed URL options apply). */
  usesEmbedUrl: boolean;
  /** Ordered calls for this session. The intent-secret switch changes these, not the code. */
  steps(session: Session): FlowStep[];
  /** Fields this flow adds to the intent request. */
  intentFields?(session: Session): IntentBody;
  Checkout?: ComponentType<FlowCheckoutProps>;
}
