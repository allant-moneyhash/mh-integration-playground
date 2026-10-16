// The single place that reads the "Use intent secret" switch.
// Flows ask the session what to do; they never check the switch themselves.
import { ENVIRONMENTS, type ApiVersion, type EnvId } from '@/lib/hosts';

export type Session = {
  env: EnvId;
  apiVersion: ApiVersion;
  useIntentSecret: boolean;
  /** Key typed in the UI, sent per request to our server. Empty = demo account. */
  apiKey: string;
  publicApiKey: string;
  embedHost: string;
  lang?: string;
};

export function resolveSession(
  cfg: {
    env: EnvId;
    apiVersion: ApiVersion;
    useIntentSecret: boolean;
    embedOptions: Record<string, string | boolean>;
  },
  keys: { apiKey: string; publicApiKey: string },
): Session {
  const lang = cfg.embedOptions.lang;
  return {
    env: cfg.env,
    apiVersion: cfg.apiVersion,
    useIntentSecret: cfg.useIntentSecret,
    apiKey: keys.apiKey,
    publicApiKey: keys.publicApiKey,
    embedHost: ENVIRONMENTS[cfg.env].embed,
    lang: typeof lang === 'string' && lang ? lang : undefined,
  };
}

type IntentData = { id?: string; embed_url?: string; intent_secret?: string; state_details?: { embed_url?: string } };

/**
 * The embed URL to load. Secret on: use it as MoneyHash returned it (it carries
 * mh_intent_secret). Secret off: the same URL without the secret.
 */
export function embedUrlFor(session: Session, intent: IntentData): string {
  const raw = intent.embed_url ?? intent.state_details?.embed_url ?? `${session.embedHost}/embed/payment/${intent.id}`;
  const url = new URL(raw);
  if (session.useIntentSecret) {
    if (!url.searchParams.get('mh_intent_secret') && intent.intent_secret) {
      url.searchParams.set('mh_intent_secret', intent.intent_secret);
    }
  } else {
    url.searchParams.delete('mh_intent_secret');
  }
  if (session.lang) url.searchParams.set('lang', session.lang);
  return url.toString();
}

/** Plain-language note for the step list. */
export function embedSecretNote(session: Session) {
  return session.useIntentSecret
    ? 'Embed URL keeps mh_intent_secret'
    : 'mh_intent_secret removed from the embed URL. Accounts with "Require Intent Secret" will reject it.';
}

/**
 * Which MoneyHash account the session talks to, without storing the key: the
 * environment plus a short fingerprint of the API key ("demo" for the server's
 * key). Customers and agreements belong to one account, so they are remembered
 * per account key; new keys start as a guest.
 */
export function accountKey(session: Pick<Session, 'env' | 'apiKey'>): string {
  if (!session.apiKey) return `${session.env}:demo`;
  let h = 0x811c9dc5;
  for (let i = 0; i < session.apiKey.length; i++) {
    h ^= session.apiKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${session.env}:${h.toString(16).padStart(8, '0')}`;
}
