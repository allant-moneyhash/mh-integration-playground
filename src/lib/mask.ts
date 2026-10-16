// Masking used everywhere a value can reach the console panel, logs or an
// export. Runs on the server (before entries leave it) and on the client
// (for SDK calls), so the rules live in one place.

const SENSITIVE_KEYS = new Set([
  'apikey',
  'xapikey',
  'xmhapikey',
  'publicapikey',
  'secret',
  'intentsecret',
  'mhintentsecret',
  'xmhintentsecret',
  'password',
  'cvv',
  'cvc',
  'authorization',
  'signingkey',
  'webhooksignaturekey',
  'accesstoken',
  'token',
  'receipt',
]);

const QUERY_SECRETS = /([?&](?:mh_intent_secret|intent_secret|token|access_token)=)[^&#\s"]+/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const PAN = /^\d{12,19}$/;

const normalise = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

export function isSensitiveKey(key: string) {
  const k = normalise(key);
  return SENSITIVE_KEYS.has(k) || k.endsWith('secret') || k.endsWith('apikey');
}

export function maskSecret(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '••••';
  if (value.endsWith('••••')) return value; // already masked (server side)
  // Show only enough to tell two keys apart.
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••`;
}

function maskString(s: string): string {
  if (PAN.test(s)) return `••••${s.slice(-4)}`;
  return s.replace(QUERY_SECRETS, '$1••••').replace(JWT, 'eyJ••••');
}

/**
 * Payment references (Sadad/Edaat invoice numbers, bill numbers, RRNs) are long
 * digit strings like card numbers but the customer needs them, so they are not
 * PAN-masked. Secrets and tokens are still masked inside them.
 */
const REFERENCE_KEY = /invoice|bill|reference|rrn|voucher|order_?(id|number)|provider_transaction_fields/i;

export function maskDeep<T>(value: T, depth = 0, isReference = false): T {
  if (depth > 25) return value;
  if (typeof value === 'string') return (isReference ? value.replace(QUERY_SECRETS, '$1••••').replace(JWT, 'eyJ••••') : maskString(value)) as T;
  if (Array.isArray(value)) return value.map(v => maskDeep(v, depth + 1, isReference)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) && (typeof v === 'string' || typeof v === 'number')) {
        out[k] = maskSecret(String(v));
      } else if (normalise(k) === 'cardnumber' && typeof v === 'string') {
        out[k] = `••••${v.replace(/\s/g, '').slice(-4)}`;
      } else {
        out[k] = maskDeep(v, depth + 1, isReference || REFERENCE_KEY.test(k));
      }
    }
    return out as T;
  }
  return value;
}
