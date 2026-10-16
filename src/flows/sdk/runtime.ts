'use client';
// One place that creates the MoneyHash JS SDK for a session:
// - points it at the right MoneyHash hosts (staging or production),
// - wraps it so every SDK call shows up in the console as "Frontend SDK",
// - applies the intent-secret switch (setIntentSecret or not).
import type MoneyHashHeadless from '@moneyhash/js-sdk/headless';
import { ENVIRONMENTS, type EnvId } from '@/lib/hosts';
import { useConsole, newId } from '@/store/console';
import { maskDeep } from '@/lib/mask';
import { useConfig } from '@/store/config';
import type { Session } from '../session';

export type Sdk = MoneyHashHeadless<'payment'>;

declare global {
  interface Window {
    MONEYHASH_IFRAME_URL?: string;
    API_URL?: string;
    MONEYHASH_VAULT_INPUT_IFRAME_URL?: string;
    MONEYHASH_VAULT_API_URL?: string;
  }
}

let currentEnv: EnvId | null = null;

function pointAt(env: EnvId) {
  const h = ENVIRONMENTS[env];
  // The SDK reads these globals when it builds its iframes and vault calls.
  // Without them, staging keys hit production and fail with 401.
  window.MONEYHASH_IFRAME_URL = h.embed;
  window.API_URL = h.api;
  window.MONEYHASH_VAULT_INPUT_IFRAME_URL = h.vaultForm;
  window.MONEYHASH_VAULT_API_URL = h.vault;
  if (currentEnv && currentEnv !== env) {
    // The SDK's hidden communication iframe is bound to the old host.
    document.getElementById('moneyhash-headless-sdk')?.remove();
  }
  currentEnv = env;
}

async function resolvePublicKey(session: Session): Promise<string> {
  if (session.publicApiKey) return session.publicApiKey;
  try {
    const res = await fetch(`/api/public-config?env=${session.env}`, { cache: 'no-store' });
    const { publicApiKey } = (await res.json()) as { publicApiKey: string | null };
    if (publicApiKey) return publicApiKey;
  } catch {
    // fall through
  }
  throw new Error('No public API key. Add your public key in Config (top right). Demo keys are not set on this deployment yet.');
}

/** SDK methods we log. Anything else (elements, listeners) is UI plumbing. */
const LOGGED = new Set([
  'getMethods',
  'getIntentMethods',
  'getIntentDetails',
  'proceedWith',
  'resetSelectedMethod',
  'renderForm',
  'renderUrl',
  'setIntentSecret',
  'submitForm',
  'submitCvv',
  'selectInstallmentPlan',
  'getInstallmentPlans',
  'submitPaymentReceipt',
  'validateApplePayMerchantSession',
  'binLookupByReceipt',
  'deleteCard',
]);

/**
 * One-line reasons for upcoming calls of an SDK method, in call order (e.g. why a
 * second getMethods is made). Each call claims its note when it starts, so two
 * parallel calls get their own.
 */
const pendingNotes = new Map<string, string[]>();
export function noteNextCall(method: string, note: string) {
  pendingNotes.set(method, [...(pendingNotes.get(method) ?? []), note]);
}
function takeNote(method: string) {
  const queue = pendingNotes.get(method);
  const note = queue?.shift();
  if (!queue?.length) pendingNotes.delete(method);
  return note;
}

function logCall(name: string, args: unknown[], started: number, result: { ok: boolean; value: unknown }, note?: string) {
  useConsole.getState().add({
    ...(note ? { note } : {}),
    id: newId(),
    ts: Date.now(),
    source: 'Frontend SDK',
    title: name.replace(/^cardForm\./, 'cardForm.'),
    method: 'SDK',
    endpoint: `moneyHash.${name}()`,
    request: { body: maskDeep(args.length === 1 ? args[0] : args) },
    latencyMs: Math.round(performance.now() - started),
    response: maskDeep(result.value ?? null),
    ok: result.ok,
  });
}

/** SDK calls whose options object can be edited from the console and sent again. */
export const EDITABLE_SDK_CALLS = new Set(['getMethods', 'proceedWith', 'submitForm', 'cardForm.pay', 'getInstallmentPlans', 'selectInstallmentPlan']);

/** The console's edits for an SDK method, if any. */
export function sdkEditsFor(name: string) {
  const p = useConfig.getState().sdkEdits?.[name];
  return p && (Object.keys(p.set).length || p.removed.length) ? p : null;
}

/** Applies the console's edits for this method to its options object; returns the fields changed. */
function withEdits(name: string, args: unknown[]): { args: unknown[]; changed: string[] } {
  const p = sdkEditsFor(name);
  const first = args[0];
  if (!p || !EDITABLE_SDK_CALLS.has(name) || !first || typeof first !== 'object' || Array.isArray(first)) return { args, changed: [] };
  const out: Record<string, unknown> = { ...(first as Record<string, unknown>), ...p.set };
  for (const k of p.removed) delete out[k];
  return { args: [out, ...args.slice(1)], changed: [...Object.keys(p.set), ...p.removed] };
}

function wrap<T extends (...a: unknown[]) => unknown>(name: string, fn: T): T {
  return ((...given: unknown[]) => {
    const { args, changed } = withEdits(name, given);
    const note = [takeNote(name), changed.length ? `Includes your console edits: ${changed.join(', ')}.` : ''].filter(Boolean).join(' ') || undefined;
    const started = performance.now();
    let out: unknown;
    try {
      out = fn(...args);
    } catch (e) {
      logCall(name, args, started, { ok: false, value: errorValue(e) }, note);
      throw e;
    }
    if (out instanceof Promise) {
      return out.then(
        v => {
          logCall(name, args, started, { ok: true, value: v }, note);
          return v;
        },
        e => {
          logCall(name, args, started, { ok: false, value: errorValue(e) }, note);
          throw e;
        },
      );
    }
    logCall(name, args, started, { ok: true, value: out }, note);
    return out;
  }) as T;
}

function errorValue(e: unknown) {
  if (e instanceof Error) return { error: e.message };
  return e ?? { error: 'Unknown SDK error' };
}

/**
 * A fresh SDK instance for one checkout attempt (so an old intent secret never
 * carries over), with every meaningful call logged.
 */
export async function createSdk(session: Session): Promise<Sdk> {
  pointAt(session.env);
  const publicApiKey = await resolvePublicKey(session);
  const { default: MoneyHashHeadless } = await import('@moneyhash/js-sdk/headless');
  const raw = new MoneyHashHeadless({ type: 'payment', publicApiKey, locale: session.lang ?? 'en' }) as Sdk;

  const logged = new Proxy(raw, {
    get(target, prop) {
      // Always read from and bind to the real instance: the SDK uses private
      // class members, which fail if `this` is the proxy.
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      const bound = value.bind(target);
      return typeof prop === 'string' && LOGGED.has(prop) ? wrap(prop, bound) : bound;
    },
  });
  // cardForm is an object of functions; log collect and pay.
  const cardForm = raw.cardForm;
  raw.cardForm = {
    ...cardForm,
    collect: wrap('cardForm.collect', cardForm.collect),
    pay: wrap('cardForm.pay', cardForm.pay as (...a: unknown[]) => unknown) as typeof cardForm.pay,
    binLookup: wrap('cardForm.binLookup', cardForm.binLookup as (...a: unknown[]) => unknown) as typeof cardForm.binLookup,
  };
  return logged;
}

/** The intent-secret switch, applied to the SDK. */
export function applyIntentSecret(sdk: Sdk, session: Session, secret: string | undefined) {
  if (session.useIntentSecret && secret) sdk.setIntentSecret(secret);
}
