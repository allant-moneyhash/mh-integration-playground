// The playground backend's webhook handling: verify and store every webhook.
// Storage is private Vercel Blob (shared by all serverless instances); without
// a Blob token it falls back to memory for local dev. The order status is
// derived from the stored webhooks (see lib/order.ts).
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { get, list, put } from '@vercel/blob';
import type { EnvId } from '@/lib/hosts';
import { maskDeep } from '@/lib/mask';
import { summariseIntent, type IntentSummary } from '@/lib/intent-outcome';

export type SignatureCheck = 'valid' | 'invalid' | 'not checked';

export type StoredWebhook = {
  id: string;
  receivedAt: number;
  env: EnvId;
  type: string;
  intentId: string | null;
  signature: SignatureCheck;
  payload: unknown; // masked
  /** Order-relevant fields from the payload (status, transaction ID, …). */
  summary?: IntentSummary;
};

const SIGNING_KEY_NAME: Record<EnvId, string> = {
  staging: 'MH_STAGING_WEBHOOK_SIGNING_KEY',
  production: 'MH_PRODUCTION_WEBHOOK_SIGNING_KEY',
};

/**
 * MoneyHash-Signature: t=<ts>,v1=..,v2=..,v3=..
 * v3 = hex(HMAC-SHA256(key, base64(rawBody) + t))
 */
export function verifySignature(rawBody: string, header: string | null, env: EnvId): SignatureCheck {
  const key = process.env[SIGNING_KEY_NAME[env]];
  if (!key || !header) return 'not checked';
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  if (!parts.t || !parts.v3) return 'invalid';
  const expected = createHmac('sha256', key)
    .update(Buffer.from(rawBody, 'utf8').toString('base64') + parts.t)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v3);
  return a.length === b.length && timingSafeEqual(a, b) ? 'valid' : 'invalid';
}

function findIntentId(payload: Record<string, unknown>): string | null {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const intent = (data.intent ?? payload.intent ?? {}) as Record<string, unknown>;
  const candidates = [intent.id, payload.intent_id, data.intent_id, data.object === 'intent' ? data.id : undefined];
  const hit = candidates.find(c => typeof c === 'string' && c.length > 0);
  return (hit as string) ?? null;
}

export function parseWebhook(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}

export function toStored(payload: Record<string, unknown>, env: EnvId, signature: SignatureCheck): StoredWebhook {
  return {
    id: randomUUID(),
    receivedAt: Date.now(),
    env,
    type: String(payload.type ?? payload.event ?? 'unknown'),
    intentId: findIntentId(payload),
    signature,
    payload: maskDeep(payload),
  };
}

// ---------- storage ----------
// Append-only: every webhook is its own private Blob file, written once and
// never overwritten, so simultaneous webhooks can't conflict and caches can't
// go stale. Paths sort by arrival time: wh/<intentId>/<ms>-<id>.json
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const prefixFor = (intentId: string) => `wh/${intentId}/`;

const g = globalThis as unknown as { __mhWebhookLog?: Map<string, { path: string; event: StoredWebhook }[]> };
const memory = (g.__mhWebhookLog ??= new Map());

export function storageMode() {
  return blobEnabled() ? 'vercel-blob' : 'memory';
}

/** Store one webhook. The summary is taken from the unmasked payload (it holds no secrets). */
export async function recordWebhook(w: StoredWebhook, payload: unknown) {
  const intentId = w.intentId ?? 'unmatched';
  const event: StoredWebhook = { ...w, summary: summariseIntent(payload) };
  const path = `${prefixFor(intentId)}${String(w.receivedAt).padStart(15, '0')}-${w.id}.json`;
  if (!blobEnabled()) {
    memory.set(intentId, [...(memory.get(intentId) ?? []), { path, event }]);
    return;
  }
  await put(path, JSON.stringify(event), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

/**
 * Webhooks for one intent that arrived after `after` (a path cursor from the
 * previous call), oldest first. Each file is downloaded once per client.
 */
export async function readWebhooks(intentId: string, after: string | null) {
  let entries: { path: string; event?: StoredWebhook }[];
  if (!blobEnabled()) {
    entries = memory.get(intentId) ?? [];
  } else {
    const { blobs } = await list({ prefix: prefixFor(intentId), limit: 100 });
    entries = blobs.map(b => ({ path: b.pathname })).sort((a, b) => a.path.localeCompare(b.path));
  }
  const fresh = entries.filter(e => !after || e.path > after);
  const events = await Promise.all(
    fresh.map(async e => {
      if (e.event) return e.event;
      const res = await get(e.path, { access: 'private' });
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text()) as StoredWebhook;
    }),
  );
  return {
    events: events.filter((e): e is StoredWebhook => e !== null),
    cursor: fresh.length ? fresh[fresh.length - 1].path : after,
  };
}
