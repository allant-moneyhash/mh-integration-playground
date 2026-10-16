// Get a payment intent from the server. The order page uses this to confirm
// the outcome instead of trusting redirect query parameters.
import { RequestError, assertNotKnownLive, errorResponse, mhCall, parseTarget, resolveApiKey } from '@/lib/server/mh';

const INTENT_ID = /^[A-Za-z0-9_-]{4,64}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!INTENT_ID.test(id)) throw new RequestError(400, 'That intent ID does not look right.');
    const url = new URL(req.url);
    const target = parseTarget(url.searchParams.get('env'), url.searchParams.get('apiVersion'));
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);

    const result = await mhCall({
      target,
      apiKey,
      method: 'GET',
      path: `/payments/intent/${id}/`,
      title: 'Get payment intent',
    });
    return Response.json(
      { ok: result.ok, status: result.status, data: result.data, entries: [result.entry] },
      { status: result.ok ? 200 : 502 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
