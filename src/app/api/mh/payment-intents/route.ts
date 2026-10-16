// Create a payment intent (Payment API). Used by the Embed flows and,
// later, the SDK flows.
import {
  LIVE_KEY_MESSAGE,
  RequestError,
  assertNotKnownLive,
  errorResponse,
  isLiveResponse,
  liveAllowed,
  LIVE_NOTE,
  mhCall,
  parseTarget,
  rememberLiveKey,
  resolveApiKey,
} from '@/lib/server/mh';

export async function POST(req: Request) {
  try {
    const input = (await req.json().catch(() => null)) as {
      env?: unknown;
      apiVersion?: unknown;
      intent?: unknown;
    } | null;
    if (
      !input ||
      typeof input.intent !== 'object' ||
      input.intent === null ||
      Array.isArray(input.intent)
    ) {
      throw new RequestError(400, 'The intent request must be a JSON object.');
    }
    const target = parseTarget(input.env, input.apiVersion);
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);

    const created = await mhCall({
      target,
      apiKey,
      method: 'POST',
      path: '/payments/intent/',
      body: input.intent,
      title: 'Create payment intent',
    });
    const entries = [created.entry];

    if (created.ok && isLiveResponse(created.data) && !liveAllowed()) {
      rememberLiveKey(apiKey);
      const id = (created.data as { data?: { id?: string } }).data?.id;
      if (id) {
        const closed = await mhCall({
          target,
          apiKey,
          method: 'POST',
          path: `/payments/intent/${encodeURIComponent(id)}/close/`,
          title: 'Close intent (live key detected)',
        });
        entries.push(closed.entry);
      }
      throw new RequestError(403, LIVE_KEY_MESSAGE, entries);
    }
    if (created.ok && isLiveResponse(created.data))
      created.entry.note = LIVE_NOTE;

    return Response.json(
      { ok: created.ok, status: created.status, data: created.data, entries },
      { status: created.ok ? 200 : 502 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
