// What the user picked: a backend API, a checkout experience, and (for "Your
// checkout page") a few settings. Everything else (steps, checkout component,
// labels) is derived from this, so a client sees one page per API and the
// settings only change who makes each call behind it.
import type { BackendApi } from './types';

/** Step 2: the journey the customer gets. */
export type Experience = 'checkout' | 'form' | 'hosted' | 'mit';

export type CheckoutSettings = {
  /** Payment API only: create the intent when the customer picks a method, or up front. */
  intentTiming: 'methods-first' | 'intent-first' | 'card-first';
  /** Where the card number is typed. "own" is Direct API only; External needs MoneyHash's iframes. */
  cardEntry: 'sdk' | 'embed' | 'own';
  /** Apple Pay / Google Pay buttons: rendered by you (your server sends the receipt) or by the SDK flow. */
  wallets: 'own' | 'sdk';
  /** 3DS and other provider pages: inside the page (SDK) or a full redirect. */
  threeDs: 'page' | 'redirect';
  /** "MoneyHash hosted page": in an iframe or a full-page redirect. */
  hosted: 'iframe' | 'redirect';
  /**
   * Payment API: what getMethods (and the intent) is scoped to. "auto" sends the Flow ID and customer
   * when they are set; the others leave one or both out; generic-then-customer is a guest call first,
   * then the same call with the customer after sign-in (methods first only).
   */
  methodsLookup: MethodsLookup;
};

export type MethodsLookup =
  'auto' | 'flow-only' | 'customer-only' | 'none' | 'generic-then-customer';
export const METHODS_LOOKUPS: MethodsLookup[] = [
  'auto',
  'flow-only',
  'customer-only',
  'none',
  'generic-then-customer',
];

/** Which of the Flow ID and customer a lookup sends. */
export function lookupSends(l: MethodsLookup) {
  return {
    flow: l !== 'customer-only' && l !== 'none',
    customer: l !== 'flow-only' && l !== 'none',
  };
}

export type Selection = {
  api: BackendApi;
  experience: Experience;
  settings: CheckoutSettings;
};

export const EXPERIENCES: {
  id: Experience;
  label: string;
  summary: string;
  soon?: boolean;
}[] = [
  {
    id: 'checkout',
    label: 'Your checkout page',
    summary: 'Your UI: wallets, saved cards and every method on one page.',
  },
  {
    id: 'form',
    label: 'MoneyHash form in your page',
    summary:
      'renderForm: the SDK draws MoneyHash’s payment form inside your page.',
  },
  {
    id: 'hosted',
    label: 'MoneyHash hosted page',
    summary:
      'The customer pays on MoneyHash’s page, in an iframe or by redirect.',
  },
  {
    id: 'mit',
    label: 'No customer present',
    summary:
      'Charge a card on file later (renewals, top-ups). Needs a customer-present setup payment first.',
    // Being redesigned as its own scenario (set-up payment, then later charges).
    soon: true,
  },
];

/** Which values each setting allows per API; the first is that API's default. */
export const ALLOWED: Record<
  BackendApi,
  {
    intentTiming: CheckoutSettings['intentTiming'][];
    cardEntry: CheckoutSettings['cardEntry'][];
    wallets: CheckoutSettings['wallets'][];
  }
> = {
  payment: {
    intentTiming: ['methods-first', 'intent-first', 'card-first'],
    cardEntry: ['sdk'],
    wallets: ['sdk'],
  },
  // Your server creates the intent on External / Direct: up front, or after the card check.
  external: {
    intentTiming: ['intent-first', 'card-first'],
    cardEntry: ['sdk', 'embed'],
    wallets: ['own', 'sdk'],
  },
  direct: {
    intentTiming: ['intent-first', 'card-first'],
    cardEntry: ['own', 'sdk', 'embed'],
    wallets: ['own', 'sdk'],
  },
};

/** Card entry that works with this timing: the embed needs an intent, so not before one exists. */
export function cardEntriesFor(
  api: BackendApi,
  timing: CheckoutSettings['intentTiming'],
) {
  return ALLOWED[api].cardEntry.filter(
    c => !(timing === 'card-first' && c === 'embed'),
  );
}

export const SETTING_LABELS = {
  intentTiming: {
    'methods-first': 'Methods first',
    'intent-first': 'Intent first',
    'card-first': 'BIN lookup first',
  },
  cardEntry: {
    sdk: 'SDK card fields',
    embed: 'MoneyHash embed',
    own: 'Your own form',
  },
  wallets: { own: 'Your own buttons', sdk: 'Via SDK' },
  threeDs: { page: 'In the page', redirect: 'Redirect' },
  hosted: { iframe: 'Iframe', redirect: 'Redirect' },
  methodsLookup: {
    auto: 'Flow and customer (as set)',
    'flow-only': 'Flow, guest (no customer)',
    'customer-only': 'Customer, no flow',
    none: 'Amount and currency only',
    'generic-then-customer': 'Guest first, then the customer signs in',
  },
} as const;

export const DEFAULT_SETTINGS: CheckoutSettings = {
  intentTiming: 'methods-first',
  cardEntry: 'sdk',
  wallets: 'sdk',
  threeDs: 'page',
  hosted: 'iframe',
  methodsLookup: 'auto',
};

export const DEFAULT_SELECTION: Selection = {
  api: 'payment',
  experience: 'checkout',
  settings: DEFAULT_SETTINGS,
};

/** Keep only combinations that work on this API. */
export function normalise(sel: Selection): Selection {
  const allowed = ALLOWED[sel.api];
  if (EXPERIENCES.find(e => e.id === sel.experience)?.soon)
    sel = { ...sel, experience: 'checkout' };
  const s = { ...DEFAULT_SETTINGS, ...sel.settings };
  // Saved before the lookup scenarios existed ("customer" sent whatever was set).
  if (!METHODS_LOOKUPS.includes(s.methodsLookup)) s.methodsLookup = 'auto';
  const intentTiming = allowed.intentTiming.includes(s.intentTiming)
    ? s.intentTiming
    : allowed.intentTiming[0];
  const cards = cardEntriesFor(sel.api, intentTiming);
  return {
    ...sel,
    settings: {
      ...s,
      intentTiming,
      cardEntry: cards.includes(s.cardEntry) ? s.cardEntry : cards[0],
      wallets: allowed.wallets.includes(s.wallets)
        ? s.wallets
        : allowed.wallets[0],
    },
  };
}

/** Switching API applies that API's defaults (each default shows the API's point). */
export function switchApi(sel: Selection, api: BackendApi): Selection {
  return normalise({
    ...sel,
    api,
    settings: {
      ...sel.settings,
      cardEntry: ALLOWED[api].cardEntry[0],
      wallets: ALLOWED[api].wallets[0],
    },
  });
}

/** Flow ids saved by earlier versions (config, presets, links). */
export function fromLegacyFlowId(id: string): Selection {
  const s = (
    api: BackendApi,
    experience: Experience,
    settings: Partial<CheckoutSettings> = {},
  ) =>
    normalise({
      api,
      experience,
      settings: { ...DEFAULT_SETTINGS, ...settings },
    });
  const map: Record<string, Selection> = {
    'embed-iframe': s('payment', 'hosted', { hosted: 'iframe' }),
    'embed-redirect': s('payment', 'hosted', { hosted: 'redirect' }),
    'sdk-methods-first': s('payment', 'checkout'),
    'sdk-intent-first': s('payment', 'checkout', {
      intentTiming: 'intent-first',
    }),
    'sdk-saved-card': s('payment', 'checkout', {
      intentTiming: 'intent-first',
    }),
    'sdk-native-pay': s('payment', 'checkout', {
      intentTiming: 'intent-first',
    }),
    'sdk-render-form': s('payment', 'form'),
    'payment-mit': s('payment', 'mit'),
    'server-normal': s('payment', 'mit'),
    'server-external': s('external', 'checkout', {
      cardEntry: 'sdk',
      wallets: 'own',
    }),
    'sdk-external': s('external', 'checkout', {
      cardEntry: 'sdk',
      wallets: 'own',
    }),
    'external-sdk': s('external', 'checkout', {
      cardEntry: 'sdk',
      wallets: 'own',
    }),
    'external-embed': s('external', 'checkout', {
      cardEntry: 'embed',
      wallets: 'own',
    }),
    'external-wallets': s('external', 'checkout', { wallets: 'own' }),
    'external-render-form': s('external', 'form'),
    'external-mit': s('external', 'mit'),
    'server-direct': s('direct', 'checkout', {
      cardEntry: 'own',
      wallets: 'own',
      threeDs: 'redirect',
    }),
    'direct-own-form': s('direct', 'checkout', {
      cardEntry: 'own',
      wallets: 'own',
      threeDs: 'redirect',
    }),
    'direct-sdk': s('direct', 'checkout', {
      cardEntry: 'own',
      wallets: 'own',
      threeDs: 'page',
    }),
    'direct-wallets': s('direct', 'checkout', {
      cardEntry: 'own',
      wallets: 'own',
    }),
    'direct-embed': s('direct', 'checkout', { cardEntry: 'embed' }),
    'direct-render-form': s('direct', 'form'),
    'direct-mit': s('direct', 'mit'),
  };
  return map[id] ?? DEFAULT_SELECTION;
}

/** Short label for the console History and the "Pay" button area. */
export function selectionLabel(sel: Selection, apiLabel: string): string {
  const exp =
    EXPERIENCES.find(e => e.id === sel.experience)?.label ?? sel.experience;
  return `${apiLabel} · ${exp}`;
}
