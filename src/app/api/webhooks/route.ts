// The merchant backend's webhook endpoint (the default webhook_url).
// POST: verify the signature and store the event (append-only).
// GET:  the storefront asks for one intent's webhooks after a cursor.
import { isEnvId } from '@/lib/hosts';
import { parseWebhook, readWebhooks, recordWebhook, storageMode, toStored, verifySignature } from '@/lib/server/webhooks';

const MAX_BODY = 256 * 1024;
const ID = /^[A-Za-z0-9_-]{4,64}$/;

export async function POST(req: Request) {
  const env = new URL(req.url).searchParams.get('env');
  if (!isEnvId(env)) return Response.json({ error: 'Unknown environment.' }, { status: 400 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: 'Payload too large.' }, { status: 413 });

  const signature = verifySignature(raw, req.headers.get('moneyhash-signature'), env);
  // With a signing key set, anything not signed by MoneyHash is refused and never
  // stored, as a real merchant backend would do. Without one, events are stored
  // as "not checked" (local dev) and the order page says so.
  if (signature === 'invalid') return Response.json({ error: 'Invalid signature.' }, { status: 401 });
  const payload = parseWebhook(raw);
  const stored = toStored(payload, env, signature);
  try {
    await recordWebhook(stored, payload);
  } catch {
    // A non-2xx makes MoneyHash retry the delivery later.
    return Response.json({ error: 'Could not store the webhook.' }, { status: 503 });
  }
  return Response.json({ received: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const intentId = url.searchParams.get('intentId');
  if (!intentId || !ID.test(intentId)) return Response.json({ error: 'intentId is required.' }, { status: 400 });
  const after = url.searchParams.get('after');
  if (after && !after.startsWith(`wh/${intentId}/`)) return Response.json({ error: 'Bad cursor.' }, { status: 400 });

  const { events, cursor } = await readWebhooks(intentId, after);
  return Response.json({ events, cursor, storage: storageMode() });
}
